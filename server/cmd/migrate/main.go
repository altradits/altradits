package main

import (
	"log"
	"os"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/altradits/altradits/server/pkg/envload"
)

func main() {
	envload.Load()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	m, err := migrate.New("file://server/database/migrations", dbURL)
	if err != nil {
		log.Fatalf("Failed to create migrator: %v", err)
	}

	if len(os.Args) < 2 {
		log.Fatal("Usage: migrate <up|down|force> [version]")
	}

	direction := os.Args[1]

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
	case "force":
		if len(os.Args) < 3 {
			log.Fatal("Usage: migrate force <version>")
		}
		version, err := strconv.Atoi(os.Args[2])
		if err != nil {
			log.Fatalf("Invalid version: %v", err)
		}
		if err := m.Force(version); err != nil {
			log.Fatalf("Force failed: %v", err)
		}
		log.Printf("✅ Forced version to %d", version)
	default:
		log.Fatalf("Unknown direction: %s (use 'up', 'down', or 'force')", direction)
	}
}
