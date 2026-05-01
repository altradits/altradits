package main

import (
	"fmt"
	"time"
)

func main() {
	// TASK:
	// 1. Create two channels: 'txStream' (transaction data) and 'timeout'.
	// 2. Launch a goroutine that sends to 'txStream' after 2 seconds.
	// 3. Use a 'select' statement to wait for either 'txStream' or a 1-second timer (time.After).
	// 4. If the timer wins, print "SECURITY TIMEOUT: Transaction server slow."
	// 5. If 'txStream' wins, print the data.
}