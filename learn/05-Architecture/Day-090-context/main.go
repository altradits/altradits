package main

import (
	"context"
	"fmt"
	"time"
)

func HeavyLifting(ctx context.Context, taskName string) {
	for {
		select {
		case <-ctx.Done():
			// The signal to stop has arrived
			fmt.Printf("🛑 [%s] received shutdown signal: %v\n", taskName, ctx.Err())
			return
		default:
			// Continue working
			fmt.Printf("🏗️  [%s] is working...\n", taskName)
			time.Sleep(500 * time.Millisecond)
		}
	}
}

func main() {
	// 1. Create a root context that cancels after 2 seconds
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel() // Good practice to prevent leaks

	// 2. Launch background workers passing the context
	go HeavyLifting(ctx, "Audit-Worker")
	go HeavyLifting(ctx, "Index-Worker")

	// Wait to see the workers in action
	time.Sleep(3 * time.Second)
	fmt.Println("🏁 Main program exiting.")
}