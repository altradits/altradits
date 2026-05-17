package ledger

import (
	"bufio"
	"strconv"
	"os"
	"time"
	"math/rand"
	"fmt"
	"strings"
	"sync"
)

type VaultLedger struct {
	sync.Mutex
	TotalBalance int64 // Stored entirely in minor units (cents)
}

// NewVaultLedger initializes a high-integrity balance sheet memory block.
func NewVaultLedger(initialDeposit int64) *VaultLedger {
	return &VaultLedger{
		TotalBalance: initialDeposit,
	}
}

// LoadPersistedState scans ledger.log to recover the last recorded balance state.
// If the file is missing or corrupted, it safely initializes with a baseline allocation.
func LoadPersistedState(fallbackDeposit int64) int64 {
	file, err := os.Open("ledger.log")
	if err != nil {
		// File doesn't exist yet, return the default entry bankroll safely
		return fallbackDeposit
	}
	defer file.Close()

	var lastLine string
	scanner := bufio.NewScanner(file)
	
	// Scan through the file to extract the absolute final row line
	for scanner.Scan() {
		lastLine = scanner.Text()
	}

	if lastLine == "" {
		return fallbackDeposit
	}

	// Parsing string logic: Extracting the target substring after "BAL:"
	// Example Line: [... Flags ...] | BAL:12,399.70 KSH
	parts := strings.Split(lastLine, "BAL:")
	if len(parts) < 2 {
		return fallbackDeposit
	}

	// Isolate the pure number string, strip currency markers and punctuation commas
	balStr := strings.TrimSpace(parts[1])
	balStr = strings.ReplaceAll(balStr, " KSH", "")
	balStr = strings.ReplaceAll(balStr, ",", "")

	// Split the integer portion from the fraction components to reconstruct raw cents safely
	centsParts := strings.Split(balStr, ".")
	if len(centsParts) != 2 {
		return fallbackDeposit
	}

	shillings, _ := strconv.ParseInt(centsParts[0], 10, 64)
	cents, _ := strconv.ParseInt(centsParts[1], 10, 64)

	// Re-compile variables into explicit whole int64 cents units
	recoveredBalance := (shillings * 100) + cents
	fmt.Printf("📂 STORAGE REGISTRY: Recovered Persistent Balance: %s KSH\n", formatWithCommas(float64(recoveredBalance)/100))
	return recoveredBalance
}

func formatWithCommas(val float64) string {
	// Separate the integer portion from the fraction components
	str := fmt.Sprintf("%.2f", val)
	parts := strings.Split(str, ".")
	intPart := parts[0]
	decPart := parts[1]

	var result []string
	length := len(intPart)

	// Walk backwards through the integer string, inserting commas every 3 steps
	for i := length; i > 0; i -= 3 {
		start := i - 3
		if start < 0 {
			start = 0
		}
		result = append([]string{intPart[start:i]}, result...)
	}

	return strings.Join(result, ",") + "." + decPart
}

func (v *VaultLedger) ApplyDynamicFlux(){
	// 🏛️ CRITICAL ADDITION: Lock the state before reading or mutating memory
    v.Lock()
    defer v.Unlock() // Automatically unlocks when the function block exits

	// Initialize a localized, time-seeded random source to simulate incoming API vectors
	source := rand.NewSource(time.Now().UnixNano())
	randomizer := rand.New(source)

	// Simulate incoming transaction variances (tracked entirely in raw integer cents)
	creditAmount := int64(randomizer.Intn(5000000))
	debitAmount := int64(randomizer.Intn(3000000))

	// Store the snapshot of the balance before the mutation occurs
	initialBalance := v.TotalBalance
	v.TotalBalance = v.TotalBalance + creditAmount - debitAmount

	// Formatting variables for visibility streams
	initStr := formatWithCommas(float64(initialBalance) / 100)
	credStr := formatWithCommas(float64(creditAmount) / 100)
	debStr := formatWithCommas(float64(debitAmount) / 100)
	finStr := formatWithCommas(float64(v.TotalBalance) / 100)

	fmt.Println("CORE ENGINE  [THREAD SAFE]")
	fmt.Printf("Initial Base: %s KSH\n", initStr)
	fmt.Printf("Credit Push: +%s KSH\n", credStr)
	fmt.Printf("Credit Pull: -%s KSH\n", debStr)
	fmt.Printf("Final Balance: %s KSH\n", finStr)

	if v.TotalBalance < 0 {
		fmt.Println("WARNING: Vault Liquidity Negative Buffer")
	} else {
		fmt.Println("VERIFICATION: Ledger balance to Atom")
	}

	// 🏛️ PERSISTENCE REGISTRY INJECTION
	// Open or create an append-only ledger audit file in the root workspace folder
	// Flags tell the OS: Create if missing (O_CREATE), Append data (O_APPEND), Read/Write (O_WRONLY)
	file, err := os.OpenFile("ledger.log", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("🚨 STRUCTURAL EXCEPTION: PERSISTENCE REGISTRY WRITING FAILURE: %v\n", err)
		return
	}
	defer file.Close() // Ensure systemic resources are freed after execution passes

	// Create an unalterable log string format line with a clean timestamp
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	logEntry := fmt.Sprintf("[%s] INIT:%s | CREDIT:+%s | DEBIT:-%s | BAL:%s\n", timestamp, initStr, credStr, debStr, finStr)

	// Etch data line to physical storage drive
	if _, err := file.WriteString(logEntry); err != nil {
		fmt.Printf("🚨 CRITICAL IO EXCEPTION: AUDIT STRIP LOGGING FAILURE: %v\n", err)
	}

}
