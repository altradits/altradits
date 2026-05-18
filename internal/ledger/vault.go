package ledger

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"sync"
	"time"
)

// TransactionRecord defines the schema layout for our machine-readable disk logs.
type TransactionRecord struct {
	Timestamp      string  `json:"timestamp"`
	InitialBase    float64 `json:"initial_base_ksh"`
	CreditIncoming float64 `json:"credit_incoming_ksh"`
	DebitOutgoing  float64 `json:"debit_outgoing_ksh"`
	FinalBalance   float64 `json:"final_balance_ksh"`
	ThreadSafe     bool    `json:"thread_safe"`
}

type VaultLedger struct {
	sync.Mutex
	TotalBalance int64 // Stored entirely in minor units (cents)
	HintCount    int64 // Structural diagnostic counter
}

// NewVaultLedger initializes a high-integrity balance sheet memory block.
func NewVaultLedger(initialDeposit int64) *VaultLedger {
	return &VaultLedger{
		TotalBalance: initialDeposit,
		HintCount:    0,
	}
}

// IncrementHintTicker safely increases the metric log under concurrency protection.
func (v *VaultLedger) IncrementHintTicker() {
	v.Lock()
	defer v.Unlock()
	v.HintCount++
	fmt.Printf("🤖 MATRIX STATE: Socratic Interaction Count Incremented [Total: %d]\n", v.HintCount)
}

func formatWithCommas(val float64) string {
	str := fmt.Sprintf("%.2f", val)
	parts := strings.Split(str, ".")
	intPart := parts[0]
	decPart := parts[1]

	var result []string
	length := len(intPart)

	for i := length; i > 0; i -= 3 {
		start := i - 3
		if start < 0 {
			start = 0
		}
		result = append([]string{intPart[start:i]}, result...)
	}

	return strings.Join(result, ",") + "." + decPart
}

// LoadPersistedState reads ledger.json and marshals the final row block back to memory.
func LoadPersistedState(fallbackDeposit int64) int64 {
	// Target the modern storage file asset cleanly
	file, err := os.Open("ledger.json")
	if err != nil {
		return fallbackDeposit // No historic JSON log found, pass default allocation
	}
	defer file.Close()

	var lastLine string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		lastLine = scanner.Text()
	}

	if lastLine == "" {
		return fallbackDeposit
	}

	// Unmarshal the raw text row back into our native schema model instance
	var lastRecord TransactionRecord
	err = json.Unmarshal([]byte(lastLine), &lastRecord)
	if err != nil {
		fmt.Printf("🚨 CORRUPTION DETECTED: Unable to decode JSON history: %v\n", err)
		return fallbackDeposit
	}

	// Reconstruct float values back to our explicit int64 minor cents system safely
	// Multiplying by 100 and rounding slightly prevents floating-point transformation holes
	recoveredBalance := int64((lastRecord.FinalBalance * 100) + 0.5)
	
	fmt.Printf("📂 STORAGE REGISTRY: Recovered Persistent Balance: %s KSH\n", formatWithCommas(float64(recoveredBalance)/100))
	return recoveredBalance
}

func (v *VaultLedger) ApplyDynamicFlux() {
	v.Lock()
	defer v.Unlock()

	source := rand.NewSource(time.Now().UnixNano())
	randomizer := rand.New(source)

	creditAmount := int64(randomizer.Intn(5000000))
	debitAmount := int64(randomizer.Intn(3000000))

	initialBalance := v.TotalBalance
	v.TotalBalance = v.TotalBalance + creditAmount - debitAmount

	initFloat := float64(initialBalance) / 100
	credFloat := float64(creditAmount) / 100
	debFloat := float64(debitAmount) / 100
	finFloat := float64(v.TotalBalance) / 100

	fmt.Println("CORE ENGINE  [THREAD SAFE]")
	fmt.Printf("Initial Base: %s KSH\n", formatWithCommas(initFloat))
	fmt.Printf("Credit Push: +%s KSH\n", formatWithCommas(credFloat))
	fmt.Printf("Debit Pull:  -%s KSH\n", formatWithCommas(debFloat)) // Fixed display tag layout
	fmt.Printf("Final Balance: %s KSH\n", formatWithCommas(finFloat))

	if v.TotalBalance < 0 {
		fmt.Println("WARNING: Vault Liquidity Negative Buffer")
	} else {
		fmt.Println("VERIFICATION: Ledger balance to Atom")
	}

	// 🏛️ PERSISTENCE REGISTRY INJECTION: Explicitly targeting ledger.json
	file, err := os.OpenFile("ledger.json", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("🚨 PERSISTENCE EXCEPTION: JSON LOG WRITE FAILURE: %v\n", err)
		return
	}
	defer file.Close() 

	logRecord := TransactionRecord{
		Timestamp:      time.Now().Format("2006-01-02 15:04:05"),
		InitialBase:    initFloat,
		CreditIncoming: credFloat,
		DebitOutgoing:  debFloat,
		FinalBalance:   finFloat,
		ThreadSafe:     true,
	}

	jsonData, err := json.Marshal(logRecord)
	if err != nil {
		fmt.Printf("🚨 SERIALIZATION EXCEPTION: JSON MARSHALING FAILURE: %v\n", err)
		return
	}

	if _, err := file.WriteString(string(jsonData) + "\n"); err != nil {
		fmt.Printf("🚨 CRITICAL IO EXCEPTION: JSON DISK WRITE FAILURE: %v\n", err)
	}
}
