package auth

import (
	"os"
	"fmt"
)

// Validate the credentials of the incomming system request
func ValidateIdentity(name string, role string) {

	// Fail first. System Dark Out
	if name == "" || role == ""|| name != "Stanley Chege Thuita" || role != "Principal Architect" {
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
