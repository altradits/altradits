package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"altradits/db" // Your generated SQLc package
)

func main() {
	ctx := context.Background()
	dbURL := "postgres://altradits_admin:forge_password@localhost:5432/altradits_vault"

	// 1. Configure the Pool
	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("Unable to parse config: %v", err)
	}
	
	// Set reasonable limits for the Forge
	config.MaxConns = 10
	config.MinConns = 2

	// 2. Establish the Pool
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		log.Fatalf("Unable to create pool: %v", err)
	}
	defer pool.Close()

	// 3. Integrate with SQLc
	queries := db.New(pool)

	// Test the connection
	err = pool.Ping(ctx)
	if err != nil {
		log.Fatalf("Database unreachable: %v", err)
	}

	fmt.Println("✅ ALTRADITS VAULT: Connection Pool Stabilized.")
	
	// Example usage
	txs, _ := queries.ListTransactions(ctx)
	fmt.Printf("Active Transactions in Ledger: %d\n", len(txs))
}