package main

import (
	"fmt"
	"time"
)

// Worker: Consumes jobs from the channel
func Worker(id int, jobs <-chan int, results chan<- int) {
	for j := range jobs {
		fmt.Printf("Worker %d started job %d\n", id, j)
		time.Sleep(time.Second) // Simulate task duration
		results <- j * 2
	}
}

func main() {
	const numJobs = 5
	jobs := make(chan int, numJobs)
	results := make(chan int, numJobs)

	// 1. Start 3 workers (The Pool)
	for w := 1; w <= 3; w++ {
		go Worker(w, jobs, results)
	}

	// 2. Send jobs to the channel
	for j := 1; j <= numJobs; j++ {
		jobs <- j
	}
	close(jobs) // Signal that no more jobs are coming

	// 3. Collect results
	for a := 1; a <= numJobs; a++ {
		fmt.Printf("Result received: %d\n", <-results)
	}
}