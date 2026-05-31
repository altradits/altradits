package main

import (
	"context"
	"log"
	"os"

	"github.com/altradits/altradits/server/internal/affordability"
	"github.com/altradits/altradits/server/internal/bedtime"
	"github.com/altradits/altradits/server/internal/budget"
	"github.com/altradits/altradits/server/internal/capture"
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
			"status":  status,
			"database": gin.H{"connected": dbOK},
			"redis":    gin.H{"connected": redisOK},
			"app":     "altradits",
			"version": "0.1.0",
		})
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

	r.POST("/bedtime/close", bedtime.BedtimeCloseHandler())
	r.POST("/affordability/check", affordability.AffordabilityCheckHandler())
	r.GET("/forecast", forecast.ForecastHandler())
	r.GET("/budget", budget.BudgetHandler())
	r.GET("/goals", goals.GoalsHandler())
	r.GET("/investments", investments.InvestmentsHandler())

	r.Run() // listen and serve on 0.0.0.0:8080
}