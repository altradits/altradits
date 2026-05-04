package main

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"altradits/db"
)

type Store struct {
	*db.Queries
	pool *pgxpool.Pool
}

// TransferTx performs a money transfer from one account to another.
// It creates a transaction, updates balances, and commits or rolls back.
func (store *Store) TransferTx(ctx context.Context, senderID, receiverID string, amount float64) error {
	// 1. Begin the Transaction
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) // Safe: If we return early without committing, it rolls back

	qtx := store.Queries.WithTx(tx)

	// 2. Subtract from Sender
	// (Assuming you added UpdateAccountBalance to your query.sql)
	err = qtx.UpdateAccountBalance(ctx, db.UpdateAccountBalanceParams{
		ID:     senderID,
		Amount: -amount,
	})
	if err != nil {
		return fmt.Errorf("sender deduction failed: %v", err)
	}

	// 3. Add to Receiver
	err = qtx.UpdateAccountBalance(ctx, db.UpdateAccountBalanceParams{
		ID:     receiverID,
		Amount: amount,
	})
	if err != nil {
		return fmt.Errorf("receiver credit failed: %v", err)
	}

	// 4. Commit the Transaction
	return tx.Commit(ctx)
}