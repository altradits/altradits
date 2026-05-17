package main

import (
	"fmt"
	"flag"
	"github.com/altradits/altradits/internal/auth"
	"github.com/altradits/altradits/internal/ledger"
)

func main() {
	// 1. Establish the flags
	nameFlag := flag.String("name", "", "The legal name of the system operator")
	roleFlag := flag.String("role", "", "The professional role of the operator")

	// 2. Parse the flags from cmd
	flag.Parse()

	// 3. Validate parsed commands
	auth.ValidateIdentity(*nameFlag, *roleFlag)

	// 4. Ledger 
	var baseBankrol int64 = 000 
	var incommingCredit int64 = 10000000
	var incommingDebit int64 = 2000000
	
	ledger.RecordTransaction(baseBankrol, incommingCredit, incommingDebit)

	// Output Feedback
	fmt.Println("====================================")
	fmt.Println("💗 Permanent Pulse Detected. ChouMi Out 👋😊")
}
