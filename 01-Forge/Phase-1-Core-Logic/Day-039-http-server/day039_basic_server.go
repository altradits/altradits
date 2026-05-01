package main

import (
	"fmt"
	"net/http"
)

func main() {
	// TASK:
	// 1. Create a handler function for the root path "/" that writes "Welcome to Altradits Core".
	// 2. Create a handler function for "/balance" that writes "Your balance is: $1,000".
	// 3. Use http.HandleFunc to register these routes.
	// 4. Start the server on port 8080 using http.ListenAndServe.
	// 5. Challenge: Read a query parameter (e.g., /balance?user=Stan) and personalize the response.
}