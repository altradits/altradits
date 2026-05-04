package main

import "fmt"

func main() {
	// TASK:
	// 1. Declare an integer 'balance' representing cents (e.g., 50050 for $500.50).
	// 2. Use fmt.Println to output a professional bank initialization message.
	// 3. Experiment: What happens if you try to add a string and an integer
	//    inside the Println function?

	// Step 1: Declare an integer 'balance' representing cents
	balance := 50050 // This represents $500.50 in cents

	// Step 2: Use fmt.Println to output a professional bank initialization message
	fmt.Println("Welcome to Altradits Bank! Your balance is: ", balance)
}
