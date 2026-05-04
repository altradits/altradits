package main

import (
    "context"
    "encoding/json"
    "time"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/redis/go-redis/v9"
    "altradits/db"
)

type Store struct {
    *db.Queries
    pool  *pgxpool.Pool
    rdb   *redis.Client
}

// GetVaultBalance checks Redis first, then Postgres
func (s *Store) GetVaultBalance(ctx context.Context, vaultID string) (float64, error) {
    key := "vault:balance:" + vaultID
    
    // 1. Redis Check
    val, err := s.rdb.Get(ctx, key).Result()
    if err == nil {
        var balance float64
        json.Unmarshal([]byte(val), &balance)
        return balance, nil
    }

    // 2. Postgres Fallback
    vault, err := s.GetVault(ctx, vaultID)
    if err != nil { return 0, err }

    // 3. Re-populate Cache
    s.rdb.Set(ctx, key, vault.Balance, 5*time.Minute)
    return vault.Balance, nil
}