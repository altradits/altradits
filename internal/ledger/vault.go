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

// 1. Establish custom transaction categories using typed strings
type TxType string

const (
	TxDeposit     TxType = "DEPOSIT"
	TxWithdrawal  TxType = "WITHDRAWAL"
	TxPlatformFee TxType = "PLATFORM_FEE"
)

// TransactionRecord updated to hold our categorical metadata mapping
type TransactionRecord struct {
	Timestamp      string  `json:"timestamp"`
	Type           TxType  `json:"type"` // Added category key
	InitialBase    float64 `json:"initial_base_ksh"`
	CreditIncoming float64 `json:"credit_incoming_ksh"`
	DebitOutgoing  float64 `json:"debit_outgoing_ksh"`
	FinalBalance   float64 `json:"final_balance_ksh"`
	ThreadSafe     bool    `json:"thread_safe"`
}

type VaultLedger struct {
	sync.Mutex
	TotalBalance int64
	HintCount    int64
	// 2. Added an in-memory tracking matrix map to categorize global volumes per type
	VolumeMatrix map[TxType]int64
}

// NewVaultLedger updated to cleanly instantiate our empty nested metrics map
func NewVaultLedger(initialDeposit int64) *VaultLedger {
	return &VaultLedger{
		TotalBalance: initialDeposit,
		HintCount:    0,
		VolumeMatrix: make(map[TxType]int64), // Initialize mapping allocation
	}
}

// [Keep your existing IncrementHintTicker, formatWithCommas, and LoadPersistedState exactly as you have them]
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

func LoadPersistedState(fallbackDeposit int64) int64 {
	file, err := os.Open("ledger.json") // Targeting your live JSON database file asset
	if err != nil {
		return fallbackDeposit
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
	var lastRecord TransactionRecord
	err = json.Unmarshal([]byte(lastLine), &lastRecord)
	if err != nil {
		fmt.Printf("🚨 CORRUPTION DETECTED: Unable to decode JSON history: %v\n", err)
		return fallbackDeposit
	}
	return int64((lastRecord.FinalBalance * 100) + 0.5)
}

// ApplyCategorizedFlux accepts an explicit type vector classification argument
func (v *VaultLedger) ApplyCategorizedFlux(category TxType) {
	v.Lock()
	defer v.Unlock()

	source := rand.NewSource(time.Now().UnixNano())
	randomizer := rand.New(source)

	var creditAmount int64 = 0
	var debitAmount int64 = 0

	// 3. Apply operational constraints based on our structured transaction categories
	switch category {
	case TxDeposit:
		creditAmount = int64(randomizer.Intn(5000000)) // Deposits only push capital inbound
	case TxWithdrawal:
		debitAmount = int64(randomizer.Intn(3000000)) // Withdrawals only pull capital outbound
	case TxPlatformFee:
		debitAmount = int64(randomizer.Intn(150000)) // Small flat fees applied to memory state
	}

	initialBalance := v.TotalBalance
	v.TotalBalance = v.TotalBalance + creditAmount - debitAmount

	// Accumulate transactional volume metrics safely into our structural tracker map
	v.VolumeMatrix[category] += (creditAmount + debitAmount)

	initFloat := float64(initialBalance) / 100
	credFloat := float64(creditAmount) / 100
	debFloat := float64(debitAmount) / 100
	finFloat := float64(v.TotalBalance) / 100

	fmt.Printf("CORE ENGINE  [THREAD SAFE] [%s MODE]\n", category)
	fmt.Printf("Initial Base: %s KSH\n", formatWithCommas(initFloat))
	fmt.Printf("Credit Push: +%s KSH\n", formatWithCommas(credFloat))
	fmt.Printf("Debit Pull:  -%s KSH\n", formatWithCommas(debFloat))
	fmt.Printf("Final Balance: %s KSH\n", formatWithCommas(finFloat))
	fmt.Printf("Total Volume for %s Category: %s KSH\n", category, formatWithCommas(float64(v.VolumeMatrix[category])/100))

	if v.TotalBalance < 0 {
		fmt.Println("WARNING: Vault Liquidity Negative Buffer")
	} else {
		fmt.Println("VERIFICATION: Ledger balance to Atom")
	}

	file, err := os.OpenFile("ledger.json", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Printf("🚨 PERSISTENCE EXCEPTION: JSON LOG WRITE FAILURE: %v\n", err)
		return
	}
	defer file.Close()

	logRecord := TransactionRecord{
		Timestamp:      time.Now().Format("2006-01-02 15:04:05"),
		Type:           category, // Serialization mapping updates cleanly
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
