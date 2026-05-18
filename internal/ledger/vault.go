package ledger

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"os"
	"strings"
	"sync"
	"time"
)

type TxType string

const (
	TxDeposit     TxType = "DEPOSIT"
	TxWithdrawal  TxType = "WITHDRAWAL"
	TxPlatformFee TxType = "PLATFORM_FEE"
)

type TransactionRecord struct {
	Timestamp      string  `json:"timestamp"`
	Type           TxType  `json:"type"`
	InitialBase    float64 `json:"initial_base_ksh"`
	CreditIncoming float64 `json:"credit_incoming_ksh"`
	DebitOutgoing  float64 `json:"debit_outgoing_ksh"`
	FinalBalance   float64 `json:"final_balance_ksh"`
	ThreadSafe     bool    `json:"thread_safe"`
	WorkerID       int     `json:"worker_id"` // Added metadata tracking tag to verify worker orchestration
}

type VaultLedger struct {
	sync.Mutex
	TotalBalance int64
	HintCount    int64
	VolumeMatrix map[TxType]int64
	LogQueue     chan TransactionRecord
	WorkerWg     *sync.WaitGroup
	WorkerMetrics map[int]int64 // New structure to track per-worker processed transaction counts
}

// NewVaultLedger updated to orchestrate a clustered Multi-Worker Pool
func NewVaultLedger(initialDeposit int64) *VaultLedger {
	v := &VaultLedger{
		TotalBalance: initialDeposit,
		HintCount:    0,
		VolumeMatrix: make(map[TxType]int64),
		WorkerMetrics: make(map[int]int64),
		LogQueue:     make(chan TransactionRecord, 1000), // Increased buffer capacity to support high throughput
		WorkerWg:     &sync.WaitGroup{},
	}

	// 🏛️ WORKER POOL ORCHESTRATION BLOCK
	// Dynamically scale out an explicit cluster of 3 parallel background consumer daemons
	workerClusterSize := 3
	for i := 1; i <= workerClusterSize; i++ {
		v.WorkerWg.Add(1)
		go v.startAsyncLogWorker(i) // Pass structural tracking index parameter
	}

	return v
}

// startAsyncLogWorker updated to accept and track its explicit WorkerID
func (v *VaultLedger) startAsyncLogWorker(id int) {
	defer v.WorkerWg.Done()
	fmt.Printf("🚀 MULTI-WORKER POOL: Background Daemon Thread [Worker #%d] Initialized.\n", id)

	for record := range v.LogQueue {
		// Attach worker context to the data tracking schema layout before disk write
		record.WorkerID = id

		v.Lock()
		v.WorkerMetrics[id]++ // Increment the processed transaction count for this worker
		v.Unlock()

		file, err := os.OpenFile("ledger.json", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			fmt.Printf("🚨 [WORKER #%d] FILE EXCEPTION: JSON LOG WRITE FAILURE: %v\n", id, err)
			continue
		}

		jsonData, err := json.Marshal(record)
		if err != nil {
			fmt.Printf("🚨 [WORKER #%d] SERIALIZATION EXCEPTION: %v\n", id, err)
			file.Close()
			continue
		}

		if _, err := file.WriteString(string(jsonData) + "\n"); err != nil {
			fmt.Printf("🚨 [WORKER #%d] IO EXCEPTION: DISK WRITE FAILURE: %v\n", id, err)
		}
		file.Close()
	}
	fmt.Printf("🔒 MULTI-WORKER POOL: Queue drained. [Worker #%d] safely terminated.\n", id)
}

// EmitTelemetryReport outputs an enterprise snapshot telemetry dashboard profile
func (v *VaultLedger) EmitTelemetryReport() {
	v.Lock()
	defer v.Unlock()

	fmt.Println("\n📊 ============ ALTRADITS KERNEL LIVE TELEMETRY ============")
	fmt.Printf("🏛️ SYSTEM VAULT BALANCE : %s KSH\n", formatWithCommas(float64(v.TotalBalance)/100))
	fmt.Printf("🧠 SOCRATIC FEEDBACK COUNTER : %d Interventions Registered\n", v.HintCount)
	
	fmt.Println("\n👷 ASYNC WORKER POOL DISTRIBUTION LOAD:")
	for id, count := range v.WorkerMetrics {
		fmt.Printf("  ├── [Worker Thread #%d] ──► Processed %d Operations\n", id, count)
	}

	fmt.Println("\n📁 CATEGORICAL VOLUME MATRIX STATS:")
	for cat, vol := range v.VolumeMatrix {
		fmt.Printf("  ├── [%s] Total Combined Flux: %s KSH\n", cat, formatWithCommas(float64(vol)/100))
	}
	fmt.Println("========================================================\n")
}

// [Keep your existing IncrementHintTicker, formatWithCommas, LoadPersistedState, and ValidateInvariants exactly as they are written]
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
	file, err := os.Open("ledger.json")
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

func (v *VaultLedger) ValidateInvariants(credit int64, debit int64) error {
	if credit < 0 || debit < 0 {
		return errors.New("DOMAIN VIOLATION: Transaction parameters cannot contain negative vectors")
	}
	projectedBalance := v.TotalBalance + credit - debit
	if projectedBalance < 0 {
		return errors.New("INSUFFICIENT LIQUIDITY: Requested vector breaches absolute floor balance boundaries")
	}
	return nil
}

func (v *VaultLedger) ApplyCategorizedFlux(category TxType) {
	v.Lock()
	defer v.Unlock()

	source := rand.NewSource(time.Now().UnixNano())
	randomizer := rand.New(source)

	var creditAmount int64 = 0
	var debitAmount int64 = 0

	switch category {
	case TxDeposit:
		creditAmount = int64(randomizer.Intn(5000000))
	case TxWithdrawal:
		debitAmount = int64(randomizer.Intn(3000000))
	case TxPlatformFee:
		debitAmount = int64(randomizer.Intn(150000))
	}

	err := v.ValidateInvariants(creditAmount, debitAmount)
	if err != nil {
		fmt.Printf("\n🛑 TRANSATION REJECTED: %v [METRICS BYPASSED]\n", err)
		return
	}

	initialBalance := v.TotalBalance
	v.TotalBalance = v.TotalBalance + creditAmount - debitAmount

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
	fmt.Println("VERIFICATION: Ledger balance to Atom")

	v.LogQueue <- TransactionRecord{
		Timestamp:      time.Now().Format("2006-01-02 15:04:05"),
		Type:           category,
		InitialBase:    initFloat,
		CreditIncoming: credFloat,
		DebitOutgoing:  debFloat,
		FinalBalance:   finFloat,
		ThreadSafe:     true,
	}
}
