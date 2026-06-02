package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/altradits/altradits/server/internal/affordability"
	"github.com/altradits/altradits/server/internal/bedtime"
	"github.com/altradits/altradits/server/internal/budget"
	"github.com/altradits/altradits/server/internal/capture"
	"github.com/altradits/altradits/server/internal/dashboard"
	"github.com/altradits/altradits/server/internal/forecast"
	"github.com/altradits/altradits/server/internal/goals"
	"github.com/altradits/altradits/server/internal/investments"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

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

	// Health check — place this with the other route registrations
	r.GET("/health", func(c *gin.Context) {
		dbOK := false
		redisOK := false

		// Check DB (use whatever pool/db variable already exists in main.go,
		// or add a ping using the pool created in Step 3.4 below)
		if pool != nil {
			dbOK = pool.Ping(c.Request.Context()) == nil
		}

		// Check Redis (use the rdb variable created in Step 3.4 below)
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

	// Dashboard summary endpoint
	dashboardService := dashboard.NewService(pool)
	r.GET("/dashboard", func(c *gin.Context) {
		summary, err := dashboardService.Get(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load dashboard"})
			return
		}
		c.JSON(200, summary)
	})

	// API routes
	captureService := capture.NewService(pool)

	r.POST("/capture", func(c *gin.Context) {
		var input capture.CaptureInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "raw input is required"})
			return
		}

		result, err := captureService.Save(c.Request.Context(), input.Raw)
		if err != nil {
			c.JSON(422, gin.H{"error": err.Error()})
			return
		}

		c.JSON(201, result)
	})

	// Add a GET route to fetch recent transactions (add after /capture):
	r.GET("/capture/recent", func(c *gin.Context) {
		txns, err := captureService.Recent(c.Request.Context(), 10)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not fetch transactions"})
			return
		}
		c.JSON(200, gin.H{"transactions": txns})
	})

	bedtimeService := bedtime.NewService(pool)

	// Get today's spending review (step 1 of the bedtime flow)
	r.GET("/bedtime/review", func(c *gin.Context) {
		review, err := bedtimeService.TodayReview(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load today's review"})
			return
		}
		coaching := bedtimeService.GenerateCoaching(c.Request.Context(), review)
		c.JSON(200, gin.H{
			"review":   review,
			"coaching": coaching,
		})
	})

	// Close the day (final step of the bedtime flow)
	r.POST("/bedtime/close", func(c *gin.Context) {
		var input bedtime.CloseInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "invalid input"})
			return
		}
		snapshot, err := bedtimeService.Close(c.Request.Context(), input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not close day"})
			return
		}
		c.JSON(200, gin.H{
			"snapshot": snapshot,
			"message":  "Day closed. Sleep well. 🌙",
		})
	})

	// Get recent daily snapshots (history)
	r.GET("/bedtime/history", func(c *gin.Context) {
		history, err := bedtimeService.History(c.Request.Context(), 7)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load history"})
			return
		}
		c.JSON(200, gin.H{"history": history})
	})

	affordabilityService := affordability.NewService(pool)

	r.POST("/affordability/check", func(c *gin.Context) {
		var input affordability.CheckInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "item and amount are required"})
			return
		}
		result, err := affordabilityService.Check(c.Request.Context(), input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not check affordability"})
			return
		}
		c.JSON(200, result)
	})
	r.GET("/forecast", forecast.ForecastHandler())

	budgetService := budget.NewService(pool)

	r.GET("/budget", func(c *gin.Context) {
		summary, err := budgetService.Summary(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load budget"})
			return
		}
		c.JSON(200, gin.H{"budgets": summary})
	})

	r.POST("/budget", func(c *gin.Context) {
		var input budget.UpdateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "category and amount are required"})
			return
		}
		updated, err := budgetService.Update(c.Request.Context(), input.Category, input.Amount)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not update budget"})
			return
		}
		c.JSON(200, gin.H{"budget": updated, "message": "Budget updated. 🌱"})
	})

	goalsService := goals.NewService(pool)

	// List all goals
	r.GET("/goals", func(c *gin.Context) {
		list, err := goalsService.List(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": "could not load goals"})
			return
		}
		c.JSON(200, gin.H{"goals": list})
	})

	// Create a new goal
	r.POST("/goals", func(c *gin.Context) {
		var input goals.CreateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "name and target are required"})
			return
		}
		goal, err := goalsService.Create(c.Request.Context(), input)
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
	r.POST("/goals/:id/contribute", func(c *gin.Context) {
		id := c.Param("id")
		var input goals.ContributeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "amount is required"})
			return
		}
		goal, err := goalsService.Contribute(c.Request.Context(), id, input.Amount)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not update goal"})
			return
		}
		msg := fmt.Sprintf("Added KES %.0f to %s. 🌱", input.Amount, goal.Name)
		if goal.Completed {
			msg = fmt.Sprintf("🎉 You hit your %s target!", goal.Name)
		}
		c.JSON(200, gin.H{"goal": goal, "message": msg})
	})

	// Delete a goal
	r.DELETE("/goals/:id", func(c *gin.Context) {
		id := c.Param("id")
		if err := goalsService.Delete(c.Request.Context(), id); err != nil {
			c.JSON(500, gin.H{"error": "could not delete goal"})
			return
		}
		c.JSON(200, gin.H{"message": "Goal removed."})
	})

	r.GET("/investments", investments.InvestmentsHandler())

	r.Run() // listen and serve on 0.0.0.0:8080
}
