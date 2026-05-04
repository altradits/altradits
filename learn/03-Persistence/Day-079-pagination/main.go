package main

import (
	"context"
	"altradits/db" // Generated code
	"time"
)

func GetNextPage(ctx context.Context, q *db.Queries, lastTime time.Time, lastID string) ([]db.Transaction, error) {
	return q.ListTransactionsKeyset(ctx, db.ListTransactionsKeysetParams{
		LastCreatedAt: lastTime,
		LastId:        lastID,
		PageLimit:     20,
	})
}