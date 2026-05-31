package main

import (
	"log"
	"os"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	m, err := migrate.New("file://server/database/migrations", dbURL)
	if err != nil {
		log.Fatalf("Failed to create migrator: %v", err)
	}

	direction := "up"
	if len(os.Args) > 1 {
		direction = os.Args[1]
	}

	switch direction {
	case "up":
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			log.Fatalf("Migration up failed: %v", err)
		}
		log.Println("✅ Migrations applied")
	case "down":
		if err := m.Steps(-1); err != nil {
			log.Fatalf("Migration down failed: %v", err)
		}
		log.Println("✅ Last migration rolled back")
	default:
		log.Fatalf("Unknown direction: %s (use 'up' or 'down')", direction)
	}
}