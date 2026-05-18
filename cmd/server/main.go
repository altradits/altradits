package main

import (
	"flag"
	"fmt"
	"math/rand"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/altradits/altradits/internal/auth"
	"github.com/altradits/altradits/internal/ledger"
	"github.com/altradits/altradits/internal/parser"
)

func main() {
	// 1. Establish the flags
	nameFlag := flag.String("name", "", "The legal name of the system operator")
	roleFlag := flag.String("role", "", "The professional role of the operator")

	// 2. Parse the flags from cmd
	flag.Parse()

	// 3. Validate parsed commands through whitelist fortress check
	auth.ValidateIdentity(*nameFlag, *roleFlag)

	// 4. Milestone 11 & 12: Analyze structural operator flags from first principles
	textMetrics := parser.AnalyzeInputPayload(*nameFlag)
	fmt.Printf("📊 Operator Name true Character Count: %d\n", textMetrics.CharacterCount)
	fmt.Printf("📦 Operator Name raw Byte Footprint:   %d bytes\n", textMetrics.ByteSize)

	// CRITICAL FIX: Explicitly evaluate and print the Socratic Hint to the console interface
	fmt.Println(textMetrics.GenerateSocraticHint())
	fmt.Println("====================================")

	// 5. Milestone 8 & 13: Recover Financial State & Initialize Ledger Memory Struct
	startingBankroll := ledger.LoadPersistedState(50000000)
	altraditsVault := ledger.NewVaultLedger(startingBankroll)

	// Register the baseline interaction into the state struct AFTER hint generation
	altraditsVault.IncrementHintTicker()

	// 🏛️ MILESTONE 17 ADAPTIVE EVALUATION COUPLING
	// Compute the current user tracking tier based on the active state counter
	devTier := textMetrics.EvaluateDeveloperProfile(altraditsVault.HintCount)
	fmt.Printf("📊 ASSIGNED TELEMETRY PROFILE: [%s]\n", devTier)

	// Print out the custom targeted pedagogical prompt response
	fmt.Println(parser.FormatSocraticResponse(devTier))
	fmt.Println("====================================")

	// GRACEFUL SHUTDOWN INTERCEPTOR
	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	fmt.Println("\n====================================")
	fmt.Println("💗 PERMANENT HEARTBEAT ACTIVATED")
	fmt.Println("State Engine running continuously. Press Ctrl+C to safely exit.")
	fmt.Println("====================================")

	// 6. Establish a 3-second system pulse ticker channel loop
	heartbeatTicker := time.NewTicker(3 * time.Second)
	defer heartbeatTicker.Stop()

	pulseIterations := 0
	// 7. Infinite Channel Selector Loop
	for {
		select {
		case tickTime := <-heartbeatTicker.C:
			pulseIterations++
			fmt.Printf("\n[PULSE TIMER: %s] (Tick #%d)\n", tickTime.Format("15:04:05"), pulseIterations)

			// Define an array slice containing our custom classification type entities
			categories := []ledger.TxType{ledger.TxDeposit, ledger.TxWithdrawal, ledger.TxPlatformFee}

			// Select a random category identifier index on each tick interval
			source := rand.NewSource(time.Now().UnixNano())
			randomizer := rand.New(source)
			chosenCategory := categories[randomizer.Intn(len(categories))]

			// Apply transactional mutations organically labeled by categorical records
			altraditsVault.ApplyCategorizedFlux(chosenCategory)

			fmt.Println("====================================")
			fmt.Println("💗 Permanent Pulse Detected. ChouMi Out 👋😊")
			fmt.Println("====================================")

			// Print on evry 3rd pulse execution.
			if pulseIterations%3 == 0 {
				altraditsVault.EmitTelemetryReport()
			}

		case sig := <-shutdownChan:
			fmt.Printf("\n\n🚨 SIGNAL RECEIVER: Intercepted system closure signal: [%v]\n", sig)
			fmt.Println("⏳ KERNEL CLOSURE: Closing event channels and draining worker queues...")

			// 🏛️ CLOSE THE VALVE: Terminate incoming stream access to the channel queue
			close(altraditsVault.LogQueue)

			// Wait for the background logging goroutine worker to finish flushing records to disk safely
			altraditsVault.WorkerWg.Wait()

			fmt.Println("🔒 SYSTEM SECURED: Asynchronous ledger records flushed and verified. Kernel out.")
			fmt.Println("====================================")
			os.Exit(0)
		}
	}
}
