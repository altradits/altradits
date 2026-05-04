package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"

	"github.com/jackc/pgx/v5/pgxpool"
	"altradits/db" // Your SQLc generated code
)

func SeedVault(pool *pgxpool.Pool) {
	queries := db.New(pool)
	ctx := context.Background()

	names := []string{"Stan", "Alice", "Global Reserve", "Tech Corp", "Vault_01"}

	fmt.Println("🌱 Seeding Altradits Vault...")

	for i := 0; i < 50; i++ {
		_, err := queries.CreateTransaction(ctx, db.CreateTransactionParams{
			SenderName:    names[rand.Intn(len(names))],
			RecipientName: names[rand.Intn(len(names))],
			Amount:        float64(rand.Intn(100000)) / 100,
			Status:        "pending",
		})
		if err != nil {
			log.Printf("Failed to seed row %d: %v", i, err)
		}
	}
	fmt.Println("✅ 50 Transactions generated in persistent storage.")
}