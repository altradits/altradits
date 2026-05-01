package main

import (
	"flag"
	"fmt"
)

func main() {
	// TASK:
	// 1. Define a string flag 'mode' with default "dev" and a description.
	// 2. Define an int flag 'port' with default 8080.
	// 3. Define a bool flag 'debug' with default false.
	// 4. CRITICAL: Call flag.Parse() before accessing the variables.
	// 5. Output: "Starting Altradits in [mode] mode on port [port] (Debug: [debug])"
	// 6. Test: Run with 'go run day043_cli_config.go -mode=prod -port=9000 -debug'
}