package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/altradits/altradits/server/internal/affordability"
	"github.com/altradits/altradits/server/internal/auth"
	"github.com/altradits/altradits/server/internal/bedtime"
	"github.com/altradits/altradits/server/internal/budget"
	"github.com/altradits/altradits/server/internal/capture"
	"github.com/altradits/altradits/server/internal/coaching"
	"github.com/altradits/altradits/server/internal/companion"
	"github.com/altradits/altradits/server/internal/dashboard"
	"github.com/altradits/altradits/server/internal/forecast"
	"github.com/altradits/altradits/server/internal/freedom"
	"github.com/altradits/altradits/server/internal/goals"
	"github.com/altradits/altradits/server/internal/investments"
	"github.com/altradits/altradits/server/internal/notifications"
	"github.com/altradits/altradits/server/internal/sms"
	"github.com/altradits/altradits/server/workers"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

// coachingAdapter adapts coaching.Service to bedtime.CoachingGenerator
// to avoid circular imports between the two packages.
type coachingAdapter struct {
	service *coaching.Service
}

func (a *coachingAdapter) Generate(ctx context.Context, mood, reflection string) (*bedtime.CoachingNote, error) {
	result, err := a.service.Generate(ctx, "", mood, reflection)
	if err != nil {
		return nil, err
	}
	return &bedtime.CoachingNote{
		Note:         result.Note,
		TomorrowHint: result.TomorrowHint,
		Source:       result.Source,
	}, nil
}

func main() {
	// Load environment variables (add at the very top of main(), before anything else)
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found — using system environment")
	}

	// PostgreSQL connection pool
	dbURL := os.Getenv("DATABASE_URL")
	var pool *pgxpool.Pool
	if dbURL != "" {
		var err error
		pool, err = pgxpool.New(context.Background(), dbURL)
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
		defer pool.Close()
		if err := pool.Ping(context.Background()); err != nil {
			log.Fatalf("Database ping failed: %v", err)
		}
		log.Println("✅ Database connected")
	} else {
		log.Println("⚠️  DATABASE_URL not set — database disabled")
	}

	// Redis connection
	redisURL := os.Getenv("REDIS_URL")
	var rdb *redis.Client
	if redisURL != "" {
		opt, err := redis.ParseURL(redisURL)
		if err == nil {
			rdb = redis.NewClient(opt)
			if _, err := rdb.Ping(context.Background()).Result(); err != nil {
				log.Printf("⚠️  Redis ping failed (non-fatal): %v", err)
			} else {
				log.Println("✅ Redis connected")
			}
		}
	}

	r := gin.Default()

	// Configure CORS
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * 60 * 60, // 12 hours
	}))

	// Initialize auth service
	authService := auth.NewService(pool)

	// Health check — public
	r.GET("/health", func(c *gin.Context) {
		dbOK := false
		redisOK := false

		if pool != nil {
			dbOK = pool.Ping(c.Request.Context()) == nil
		}

		if rdb != nil {
			redisOK = rdb.Ping(c.Request.Context()).Err() == nil
		}

		status := "ok"
		if !dbOK || !redisOK {
			status = "degraded"
		}

		c.JSON(200, gin.H{
			"status":   status,
			"database": gin.H{"connected": dbOK},
			"redis":    gin.H{"connected": redisOK},
			"app":      "altradits",
			"version":  "0.1.0",
		})
	})

	// Public auth routes — no JWT required
	r.POST("/auth/register", func(c *gin.Context) {
		var input auth.RegisterInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "name, email, and password (min 8 chars) are required"})
			return
		}
		resp, err := authService.Register(c.Request.Context(), input)
		if err != nil {
			c.JSON(409, gin.H{"error": err.Error()})
			return
		}
		c.JSON(201, resp)
	})
	r.POST("/auth/login", func(c *gin.Context) {
		var input auth.LoginInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "email and password are required"})
			return
		}
		resp, err := authService.Login(c.Request.Context(), input)
		if err != nil {
			c.JSON(401, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, resp)
	})

	// All routes below this line require a valid JWT
	api := r.Group("/")
	api.Use(authService.Middleware())

	// Auth profile routes (protected)
	api.GET("/auth/me", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		user, err := authService.Me(c.Request.Context(), userID)
		if err != nil {
			c.JSON(404, gin.H{"error": "user not found"})
			return
		}
		c.JSON(200, user)
	})
	api.POST("/auth/logout", func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		parts := strings.SplitN(authHeader, " ", 2)
		token := ""
		if len(parts) == 2 {
			token = parts[1]
		}
		_ = authService.Logout(c.Request.Context(), token)
		c.JSON(200, gin.H{"message": "Logged out."})
	})

	// Dashboard summary endpoint
	dashboardService := dashboard.NewService(pool)
	api.GET("/dashboard", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		summary, err := dashboardService.Get(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load dashboard"})
			return
		}
		c.JSON(200, summary)
	})

	// Companion routes
	companionService := companion.NewService(pool)

	api.GET("/companion", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		state, err := companionService.Get(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load companion"})
			return
		}
		c.JSON(200, state)
	})

	api.POST("/companion/choose", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input companion.ChooseInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "companion is required"})
			return
		}
		state, err := companionService.Choose(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{
			"companion": state,
			"message":   fmt.Sprintf("Meet your companion. %s", state.Emoji),
		})
	})

	api.POST("/companion/checkin", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input companion.CheckinInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "event_type is required"})
			return
		}
		state, err := companionService.Checkin(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not update companion"})
			return
		}
		c.JSON(200, state)
	})

	api.GET("/companion/history", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		history, err := companionService.History(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load history"})
			return
		}
		c.JSON(200, gin.H{"events": history})
	})

	// API routes
	captureService := capture.NewService(pool)

	api.POST("/capture", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input capture.CaptureInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "raw input is required"})
			return
		}

		result, err := captureService.Save(c.Request.Context(), userID, input.Raw)
		if err != nil {
			c.JSON(422, gin.H{"error": err.Error()})
			return
		}

		// Award companion XP for capture
		go func() {
			_, _ = companionService.Checkin(context.Background(), "", companion.CheckinInput{
				EventType: "capture",
				Note:      result.Transaction.Description,
			})
		}()

		c.JSON(201, result)
	})

	// Add a GET route to fetch recent transactions (add after /capture):
	api.GET("/capture/recent", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		txns, err := captureService.Recent(c.Request.Context(), userID, 10)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not fetch transactions"})
			return
		}
		c.JSON(200, gin.H{"transactions": txns})
	})

	coachingService := coaching.NewService(pool)
	bedtimeService := bedtime.NewService(pool, &coachingAdapter{service: coachingService})

	// Get today's spending review (step 1 of the bedtime flow)
	api.GET("/bedtime/review", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		review, err := bedtimeService.TodayReview(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load today's review"})
			return
		}
		coachingResult, err := coachingService.Generate(c.Request.Context(), userID, "", "")
		if err != nil {
			c.JSON(500, gin.H{"error": "could not generate coaching"})
			return
		}
		coaching := bedtime.CoachingNote{Note: coachingResult.Note, TomorrowHint: coachingResult.TomorrowHint, Source: coachingResult.Source}
		c.JSON(200, gin.H{
			"review":   review,
			"coaching": coaching,
		})
	})

	// Close the day (final step of the bedtime flow)
	api.POST("/bedtime/close", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input bedtime.CloseInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "invalid input"})
			return
		}
		snapshot, err := bedtimeService.Close(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not close day"})
			return
		}
		// Award companion XP for bedtime logoff
		go func() {
			_, _ = companionService.Checkin(context.Background(), "", companion.CheckinInput{
				EventType: "bedtime",
				Note:      "Bedtime logoff completed",
			})
		}()
		c.JSON(200, gin.H{
			"snapshot": snapshot,
			"message":  "Day closed. Sleep well. 🌙",
		})
	})

	// Get recent daily snapshots (history)
	api.GET("/bedtime/history", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		history, err := bedtimeService.History(c.Request.Context(), userID, 7)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load history"})
			return
		}
		c.JSON(200, gin.H{"history": history})
	})

	// Generate a coaching note on demand
	api.POST("/coaching/note", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input struct {
			Mood       string `json:"mood"`
			Reflection string `json:"reflection"`
		}
		_ = c.ShouldBindJSON(&input)

		note, err := coachingService.Generate(c.Request.Context(), userID, input.Mood, input.Reflection)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not generate coaching note"})
			return
		}
		c.JSON(200, note)
	})

	affordabilityService := affordability.NewService(pool)

	api.POST("/affordability/check", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input affordability.CheckInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "item and amount are required"})
			return
		}
		result, err := affordabilityService.Check(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not check affordability"})
			return
		}
		c.JSON(200, result)
	})
	r.GET("/forecast", forecast.ForecastHandler())

	budgetService := budget.NewService(pool)

	api.GET("/budget", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		summary, err := budgetService.Summary(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load budget"})
			return
		}
		c.JSON(200, gin.H{"budgets": summary})
	})

	api.POST("/budget", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input budget.UpdateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "category and amount are required"})
			return
		}
		updated, err := budgetService.Update(c.Request.Context(), userID, input.Category, input.Amount)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not update budget"})
			return
		}
		c.JSON(200, gin.H{"budget": updated, "message": "Budget updated. 🌱"})
	})

	goalsService := goals.NewService(pool)

	// List all goals
	api.GET("/goals", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		list, err := goalsService.List(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load goals"})
			return
		}
		c.JSON(200, gin.H{"goals": list})
	})

	// Create a new goal
	api.POST("/goals", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input goals.CreateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "name and target are required"})
			return
		}
		goal, err := goalsService.Create(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not create goal"})
			return
		}
		c.JSON(201, gin.H{
			"goal":    goal,
			"message": fmt.Sprintf("First step toward %s. 🌱", goal.Name),
		})
	})

	// Contribute to a goal
	api.POST("/goals/:id/contribute", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input goals.ContributeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "amount is required"})
			return
		}
		goal, err := goalsService.Contribute(c.Request.Context(), userID, id, input.Amount)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not update goal"})
			return
		}
		// Award companion XP for goal contribution
		go func() {
			_, _ = companionService.Checkin(context.Background(), "", companion.CheckinInput{
				EventType: "goal",
				Note:      fmt.Sprintf("Contributed to %s", goal.Name),
			})
		}()
		msg := fmt.Sprintf("Added KES %.0f to %s. 🌱", input.Amount, goal.Name)
		if goal.Completed {
			msg = fmt.Sprintf("🎉 You hit your %s target!", goal.Name)
		}
		c.JSON(200, gin.H{"goal": goal, "message": msg})
	})

	// Delete a goal
	api.DELETE("/goals/:id", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		if err := goalsService.Delete(c.Request.Context(), userID, id); err != nil {
			c.JSON(500, gin.H{"error": "could not delete goal"})
			return
		}
		c.JSON(200, gin.H{"message": "Goal removed."})
	})

	smsService := sms.NewService(pool)

	// Parse a raw SMS string — returns a suggestion, saves nothing
	api.POST("/sms/parse", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var req sms.ParseRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "raw_text is required"})
			return
		}
		result, err := smsService.Parse(c.Request.Context(), userID, req.RawText)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not parse SMS"})
			return
		}
		c.JSON(200, result)
	})

	// Confirm a parsed SMS — creates the transaction
	api.POST("/sms/confirm", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var req sms.ConfirmRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "inbox_id and amount are required"})
			return
		}
		result, err := smsService.Confirm(c.Request.Context(), userID, req)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not confirm SMS"})
			return
		}
		c.JSON(201, result)
	})

	// Dismiss a parsed SMS without saving
	api.POST("/sms/dismiss", func(c *gin.Context) {
		var req struct {
			InboxID string `json:"inbox_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "inbox_id is required"})
			return
		}
		if err := smsService.Dismiss(c.Request.Context(), req.InboxID); err != nil {
			c.JSON(500, gin.H{"error": "could not dismiss"})
			return
		}
		c.JSON(200, gin.H{"message": "Dismissed."})
	})

	// Get pending SMS inbox items
	api.GET("/sms/pending", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		items, err := smsService.Pending(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load inbox"})
			return
		}
		c.JSON(200, gin.H{"items": items})
	})

	// Investment routes
	investmentsService := investments.NewService(pool)

	// List all positions
	api.GET("/investments", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		positions, err := investmentsService.List(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load investments"})
			return
		}
		c.JSON(200, positions)
	})

	// Portfolio summary with allocation and freedom score
	api.GET("/investments/summary", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		summary, err := investmentsService.Summary(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load portfolio summary"})
			return
		}
		// Convert Portfolio to frontend expected format
		allocationMap := make(map[string]float64)
		for _, alloc := range summary.Allocation {
			allocationMap[alloc.Type] = alloc.Percent
		}
		frontendSummary := map[string]interface{}{
			"total_invested":      summary.TotalPrincipal,
			"total_current_value": summary.TotalValue,
			"total_growth":        summary.TotalGrowth,
			"allocation":          allocationMap,
			"freedom_score": map[string]interface{}{
				"monthly_expenses":  summary.FreedomScore.MonthlyExpenses,
				"estimated_passive": summary.FreedomScore.EstimatedPassive,
				"coverage_percent":  summary.FreedomScore.CoveragePercent,
				"message":           summary.FreedomScore.Message,
			},
		}
		c.JSON(200, frontendSummary)
	})

	// Add a new position
	api.POST("/investments", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input investments.CreateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "name, type, and principal are required"})
			return
		}
		// Validate investment type
		validTypes := map[string]bool{
			"mmf":    true,
			"tbill":  true,
			"bond":   true,
			"stock":  true,
			"etf":    true,
			"sacco":  true,
			"fixed":  true,
			"crypto": true,
			"other":  true,
		}
		if !validTypes[input.Type] {
			c.JSON(400, gin.H{"error": "invalid investment type"})
			return
		}
		position, err := investmentsService.Create(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not add investment"})
			return
		}
		c.JSON(201, gin.H{
			"position": position,
			"message":  fmt.Sprintf("Logged. %s is now in your picture. 🌱", position.Name),
		})
	})

	// Update current value
	api.PUT("/investments/:id", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input investments.UpdateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "current_value is required"})
			return
		}
		position, err := investmentsService.Update(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not update investment"})
			return
		}
		c.JSON(200, gin.H{
			"position": position,
			"message":  "Value updated. 🌱",
		})
	})

	// Remove a position (soft delete)
	api.DELETE("/investments/:id", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		if err := investmentsService.Delete(c.Request.Context(), userID, id); err != nil {
			c.JSON(500, gin.H{"error": "could not remove investment"})
			return
		}
		c.JSON(200, gin.H{"message": "Removed from your picture."})
	})

	// Freedom planner routes
	freedomService := freedom.NewService(pool)

	// Full freedom plan
	api.GET("/freedom", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		plan, err := freedomService.GetPlan(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not calculate freedom plan"})
			return
		}
		c.JSON(200, plan)
	})

	// Set or update the freedom target
	api.POST("/freedom/targets", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input freedom.TargetInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "monthly_savings and target_passive are required"})
			return
		}
		target, err := freedomService.SetTarget(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not save target"})
			return
		}
		c.JSON(200, gin.H{
			"target":  target,
			"message": "Freedom target updated. 🌱",
		})
	})

	notifService := notifications.NewService(pool)

	go workers.NewBedtimeWorker(pool, notifService).Run(context.Background())

	api.GET("/notifications", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		items, err := notifService.List(c.Request.Context(), userID, 20)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load notifications"})
			return
		}
		c.JSON(200, gin.H{"notifications": items})
	})

	api.GET("/notifications/unread-count", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		count, err := notifService.UnreadCount(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not count notifications"})
			return
		}
		c.JSON(200, gin.H{"count": count})
	})

	api.POST("/notifications/:id/read", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		notifID := c.Param("id")
		if err := notifService.MarkRead(c.Request.Context(), userID, notifID); err != nil {
			c.JSON(500, gin.H{"error": "could not mark as read"})
			return
		}
		c.JSON(200, gin.H{"message": "Marked as read."})
	})

	api.POST("/notifications/read-all", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		if err := notifService.MarkAllRead(c.Request.Context(), userID); err != nil {
			c.JSON(500, gin.H{"error": "could not mark all as read"})
			return
		}
		c.JSON(200, gin.H{"message": "All marked as read."})
	})

	api.GET("/notifications/preferences", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		prefs, err := notifService.GetPreferences(c.Request.Context(), userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load preferences"})
			return
		}
		c.JSON(200, prefs)
	})

	api.PUT("/notifications/preferences", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input notifications.PreferencesInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "invalid preferences"})
			return
		}
		prefs, err := notifService.UpdatePreferences(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not save preferences"})
			return
		}
		c.JSON(200, gin.H{"preferences": prefs, "message": "Preferences saved. 🌱"})
	})

	api.POST("/notifications/trigger", func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var body struct {
			Type string `json:"type" binding:"required"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": "type is required"})
			return
		}
		switch body.Type {
		case "bedtime_reminder":
			_ = notifService.CheckAndSendBedtimeReminder(c.Request.Context(), userID)
		case "goal_milestone":
			_ = notifService.CheckAndSendGoalMilestones(c.Request.Context(), userID)
		case "streak_at_risk":
			_ = notifService.CheckAndSendStreakAtRisk(c.Request.Context(), userID)
		case "weekly_summary":
			_ = notifService.SendWeeklySummary(c.Request.Context(), userID)
		default:
			c.JSON(400, gin.H{"error": "unknown notification type"})
			return
		}
		c.JSON(200, gin.H{"message": fmt.Sprintf("Triggered %s. Check /notifications.", body.Type)})
	})

	r.Run() // listen and serve on 0.0.0.0:8080
}
