package main

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client
var ctx = context.Background()

func GetFounderBalance(founderID string) (string, error) {
	cacheKey := fmt.Sprintf("balance:%s", founderID)

	// 1. Try to get from Redis
	val, err := rdb.Get(ctx, cacheKey).Result()
	if err == nil {
		fmt.Println("🚀 Cache Hit!")
		return val, nil
	}

	// 2. Cache Miss: Get from Postgres (Simulated)
	fmt.Println("🐢 Cache Miss! Fetching from Postgres...")
	dbValue := "1450000.42" 

	// 3. Save to Redis for 10 minutes
	err = rdb.Set(ctx, cacheKey, dbValue, 10*time.Minute).Err()
	if err != nil {
		return "", err
	}

	return dbValue, nil
}

func main() {
	rdb = redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	balance, _ := GetFounderBalance("stan_01")
	fmt.Printf("Balance: %s\n", balance)
}