package main

import (
	"context"
	"log"
	"os"

	"github.com/altradits/altradits/server/internal/admin"
	"github.com/altradits/altradits/server/internal/auth"
	"github.com/altradits/altradits/server/internal/liquidity"
	"github.com/altradits/altradits/server/internal/treasury"
	"github.com/altradits/altradits/server/internal/wallet"
	"github.com/altradits/altradits/server/pkg/envload"
	"github.com/altradits/altradits/server/workers"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	envload.Load()

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

	// Seed/promote the configured admin account, if any (never logs the
	// email or password — see ADMIN_EMAIL / ADMIN_PASSWORD in .env.example).
	if pool != nil {
		if err := authService.SeedAdmin(context.Background()); err != nil {
			log.Printf("⚠️  Admin account seed failed: %v", err)
		} else if os.Getenv("ADMIN_EMAIL") != "" {
			log.Println("✅ Admin account ready")
		}
	}

	// Wallet service — created early so /health can report Lightning status.
	exchangeRateService := wallet.NewExchangeRateService(pool, rdb)
	walletService := wallet.NewService(pool, exchangeRateService, wallet.NewMpesaProvider(), wallet.NewLightningProvider())

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
			"status":    status,
			"database":  gin.H{"connected": dbOK},
			"redis":     gin.H{"connected": redisOK},
			"lightning": walletService.LightningStatus(c.Request.Context()),
			"app":       "altradits",
			"version":   "0.1.0",
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
		c.JSON(200, gin.H{"message": "Logged out."})
	})

	// Wallet routes — Bitcoin Lightning + M-Pesa
	wallet.RegisterRoutes(api, walletService)
	wallet.RegisterPublicRoutes(r, walletService)

	// Treasury routes — savings pool allocation + interest
	treasuryService := treasury.NewService(pool)
	treasury.RegisterRoutes(api, treasuryService)

	// Liquidity routes — Lightning node health, channels, on-chain reserves
	liquidityService := liquidity.NewService(pool)

	// Admin routes — bank-wide oversight, admin accounts only
	adminService := admin.NewService(pool)
	adminGroup := api.Group("/admin")
	adminGroup.Use(auth.AdminMiddleware())
	admin.RegisterRoutes(adminGroup, adminService)
	treasury.RegisterAdminRoutes(adminGroup, treasuryService)
	liquidity.RegisterAdminRoutes(adminGroup, liquidityService)

	go workers.NewExchangeRateWorker(exchangeRateService).Run(context.Background())
	go workers.NewPoolNAVWorker(treasuryService).Run(context.Background())
	go workers.NewLiquidityWorker(liquidityService).Run(context.Background())

	r.Run() // listen and serve on 0.0.0.0:8080
}
