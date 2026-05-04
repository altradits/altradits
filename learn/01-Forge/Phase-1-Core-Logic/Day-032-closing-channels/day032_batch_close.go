package main

import "fmt"

func main() {
	// TASK:
	// 1. Create a channel 'jobs'.
	// 2. Launch a goroutine that sends 5 integers (Job IDs) and then calls 'close(jobs)'.
	// 3. In main, use a 'for range' loop to read from the channel.
	// 4. Observe: Does the loop exit automatically when the channel is closed?
	// 5. Challenge: Try to send a 6th integer after the channel is closed.
}