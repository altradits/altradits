package main

import (
	"fmt"
	"flag"
	"time"
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

	fmt.Println("\n====================================")
    fmt.Println("💗 PERMANENT HEARTBEAT ACTIVATED")
    fmt.Println("State Engine running continuously. Press Ctrl+C to halt.")
    fmt.Println("====================================")

	// 4. Instanciate Structured Ledger 
	altraditsVault := ledger.NewVaultLedger(000)
	
	var incommingCredit int64 = 2500000
	var incommingDebit int64 = 1000000

	// 5. Establish a 3-second system pulse ticker channel loop
    heartbeatTicker := time.NewTicker(3 * time.Second)
    defer heartbeatTicker.Stop()

    // 6. Infinite Channel Selector Loop
    for {
		select {
			case tickTime := <-heartbeatTicker.C:
				fmt.Printf("\n[PULSE TIMER: %s]\n", tickTime.Format("15:04:05"))

				// Apply transaction changes recursively over time
				altraditsVault.ApplyTransaction(incommingCredit, incommingDebit)
				
				fmt.Println("====================================")
				fmt.Println("💗 Permanent Pulse Detected. ChouMi Out 👋😊")
				fmt.Println("====================================")
		}
	}
}
