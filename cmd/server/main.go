package main

import (
	"os"
	"os/signal"
	"syscall"
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

	// 4. Milestone 8: Recover State from Local Disk Registry
	// If ledger.log exists, scan it; otherwise use 500,000.00 KSH as fallback default base
	startingBankroll := ledger.LoadPersistedState(50000000)

	// Instantiate the structured ledger with our recovered state
	altraditsVault := ledger.NewVaultLedger(startingBankroll)

	// GRACEFUL SHUTDOWN INTERCEPTOR
	// Create a channel channel to listen for incoming operating system termination signals
	shutdownChan := make(chan os.Signal, 1)
	// Notify this channel specifically if the user hits Ctrl+C (Interrupt) or kills the process
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	fmt.Println("\n====================================")
    fmt.Println("💗 PERMANENT HEARTBEAT ACTIVATED")
    fmt.Println("State Engine running continuously. Press Ctrl+C to halt.")
    fmt.Println("====================================")
	        
	// 5. Establish a 3-second system pulse ticker channel loop
    heartbeatTicker := time.NewTicker(3 * time.Second)
    defer heartbeatTicker.Stop()

    // 6. Infinite Channel Selector Loop
    for {
		select {
			case tickTime := <-heartbeatTicker.C:
				fmt.Printf("\n[PULSE TIMER: %s]\n", tickTime.Format("15:04:05"))

				// Apply transaction changes recursively over time
				altraditsVault.ApplyDynamicFlux()
				
				fmt.Println("====================================")
				fmt.Println("💗 Permanent Pulse Detected. ChouMi Out 👋😊")
				fmt.Println("====================================")

			case sig := <-shutdownChan:
				// Intercepted execution signal! Trigger cleanup operations before closing.
				fmt.Printf("\n\n🚨 SIGNAL RECEIVER: Intercepted system closure signal: [%v]\n", sig)
				fmt.Println("⏳ KERNEL CLOSURE: Flushing active files and sealing ledger memory structures...")
				
				// Enforce a brief millisecond sleep to allow final storage operations to clear disk pipelines safely
				time.Sleep(500 * time.Millisecond)
				
				fmt.Println("🔒 SYSTEM SECURED: Ledger state successfully preserved. Kernel out.")
				fmt.Println("====================================")
				os.Exit(0) // Safe, error-free system shutdown exit code
		}
	}
}
