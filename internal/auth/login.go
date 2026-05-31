package auth

import (
	"fmt"
	"os"
)

// Get expected credentials from environment variables with secure defaults
func getExpectedCredentials() (string, string) {
	name := os.Getenv("ALTRADITS_OPERATOR_NAME")
	role := os.Getenv("ALTRADITS_OPERATOR_ROLE")
	
	// Return empty strings if not set - will trigger rejection
	return name, role
}

// Validate the credentials of the incoming system request
func ValidateIdentity(name string, role string) {
	expectedName, expectedRole := getExpectedCredentials()

	// Fail first. System Dark Out
	if name == "" || role == "" || name != expectedName || role != expectedRole {
		fmt.Println("🚨 SYSTEM DARK OUT ACTIVATED")
		fmt.Println("====================================")
		
		fmt.Println("Not Today ChouMi 🤓")
		fmt.Println("====================================")
		os.Exit(1)
	}
	
	// Grant Access and initialize Dynamic Handshake
	fmt.Println("🏦 ALTRADITS KERNEL: INITIALIZING...")
	fmt.Println("====================================")

	fmt.Printf("Name: %s\n", name)
	fmt.Printf("Role: %s\n", role)
}
