package main

import (
	"fmt"
	"sync"
	"time"
)

func AuditTransaction(id int, wg *sync.WaitGroup) {
	// Signal to the WaitGroup that this worker is done when the function exits
	defer wg.Done()

	fmt.Printf("🔍 Auditing Transaction #%d...\n", id)
	time.Sleep(500 * time.Millisecond) // Simulate heavy crypto/DB work
	fmt.Printf("✅ Transaction #%d Verified.\n", id)
}

func main() {
	start := time.Now()
	var wg sync.WaitGroup

	txCount := 10

	for i := 1; i <= txCount; i++ {
		// Increment the counter
		wg.Add(1)
		
		// Launch the worker in a separate Goroutine
		go AuditTransaction(i, &wg)
	}

	// Block here until the counter reaches zero
	wg.Wait()

	fmt.Printf("🏁 Bulk Audit Complete in %s\n", time.Since(start))
}