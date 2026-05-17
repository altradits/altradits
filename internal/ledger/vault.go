package ledger

import "fmt"

func RecordTransaction(initialBalance int64, creditAmount int64, debitAmount int64) {

	fmt.Println("CORE ENGINE LEDGER")

	finalBalance := initialBalance + creditAmount - debitAmount

	fmt.Printf("Initial Base: %.2f\n", float64(initialBalance)/100)
	fmt.Printf("Credit Push: +%.2f\n", float64(creditAmount)/100)
	fmt.Printf("Credit Pull: -%.2f\n", float64(creditAmount)/100)
	fmt.Printf("Final Balance: %.2f\n", float64(finalBalance)/100)
}
