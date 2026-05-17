package ledger

import (
	"fmt"
	"strings"
)

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

func RecordTransaction(initialBalance int64, creditAmount int64, debitAmount int64) {

	fmt.Println("CORE ENGINE LEDGER")

	finalBalance := initialBalance + creditAmount - debitAmount

	fmt.Printf("Initial Base: %s\n", formatWithCommas(float64(initialBalance)/100))
	fmt.Printf("Credit Push: +%s\n", formatWithCommas(float64(creditAmount)/100))
	fmt.Printf("Credit Pull: -%s\n", formatWithCommas(float64(debitAmount)/100))
	fmt.Printf("Final Balance: %s\n", formatWithCommas(float64(finalBalance)/100))

	if finalBalance < 0 {
		fmt.Println("WARNING: Vault Liquidity Negative Buffer")
	} else {
		fmt.Println("VERIFICATION: Ledger balance to Atom")
	}
}
