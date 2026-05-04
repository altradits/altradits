package main

import (
	"fmt"
	"io"
	"net/http"
)

func main() {
	// TASK:
	// 1. Use http.Get to fetch data from a public API (e.g., "https://api.github.com").
	// 2. Check the response status code. If not 200 OK, handle the error.
	// 3. Read the response body using io.ReadAll.
	// 4. Important: Use 'defer resp.Body.Close()' immediately after checking the error.
	// 5. Print the first 100 characters of the response.
}