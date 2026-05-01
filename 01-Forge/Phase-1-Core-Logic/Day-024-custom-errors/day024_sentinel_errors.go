package main

import (
	"errors"
	"fmt"
)

// TASK:
// 1. Define a "Sentinel Error" at the package level: var ErrAccountLocked = errors.New("...")
// 2. Create a function 'Login(status string) error' that returns this specific error.
// 3. In main, use 'errors.Is(err, ErrAccountLocked)' to check if that specific error occurred.
// 4. Output a custom security alert if the account is locked.

func main() {
    // Execution goes here...
}
