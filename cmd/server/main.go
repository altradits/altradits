package main

import (
	"fmt"
	"flag"
	"github.com/altradits/altradits/internal/auth"
)

func main() {
	// 1. Establish the flags
	nameFlag := flag.String("name", "", "The legal name of the system operator")
	roleFlag := flag.String("role", "", "The professional role of the operator")

	// 2. Parse the flags from cmd
	flag.Parse()

	// 3. Validate parsed commands
	auth.ValidateIdentity(*nameFlag, *roleFlag)

	// Output Feedback
	fmt.Println("====================================")
	fmt.Println("💗 Permanent Pulse Detected. ChouMi Out 👋😊")
}
