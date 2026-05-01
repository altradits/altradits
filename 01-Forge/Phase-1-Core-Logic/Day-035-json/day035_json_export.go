package main

import (
	"encoding/json"
	"fmt"
)

type Transaction struct {
	ID     int    `json:"id"`
	Amount int    `json:"amount"`
	Status string `json:"status"`
}

func main() {
	// TASK:
	// 1. Create an instance of the Transaction struct.
	// 2. Use json.Marshal to convert the struct into a JSON byte slice.
	// 3. Print the JSON string using string(byteSlice).
	// 4. Create a JSON string and use json.Unmarshal to convert it back into a struct.
	// 5. Challenge: What happens if the JSON string has a field that isn't in the struct?
}