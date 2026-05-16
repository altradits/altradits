package auth

import (
	"fmt"
)

// Validate the credentials of the incomming system request
func ValidateIdentity() {

	// Explicit naming, no room for bias
	var name string = "Stanley Chege Thuita"
	var profession string = "Principal Architect"

	// Output Feedback

	fmt.Printf("Name: %s\n", name)
	fmt.Printf("Role: %s\n", profession)

}
