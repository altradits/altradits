package main

import (
	"fmt"
	"sync"
)

// TASK:
// 1. Create a struct 'Vault' with a 'balance' (int) and a 'sync.Mutex'.
// 2. Create a method 'Deposit(amount int)' that Locks the mutex, updates the balance, and Unlocks.
// 3. Launch 1000 goroutines that each deposit 1 cent.
// 4. Print the final balance. It must be exactly 1000.

func main() {
    // Execution goes here...
}