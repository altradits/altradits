package main

import (
	"context"
	"fmt"
	"time"
)

func main() {
	// TASK:
	// 1. Create a context with a timeout of 2 seconds: 'context.WithTimeout'.
	// 2. Launch a goroutine that simulates a "Database Search" taking 5 seconds.
	// 3. Inside the goroutine, use a 'select' to check 'ctx.Done()'.
	// 4. In main, wait for the context to finish.
	// 5. Observe: Does the search stop early when the timeout hits?
}