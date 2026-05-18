package parser

import (
	"fmt"
)

// AnalysisMetrics captures structural payload dimensions safely.
type AnalysisMetrics struct {
	CharacterCount int
	ByteSize       int
}

// AnalyzeInputPayload processes string attributes from first principles.
// It bypasses default length macros to extract absolute character boundaries.
func AnalyzeInputPayload(input string) AnalysisMetrics {
	fmt.Println("\n🧠 SOCRATIC PARSER: SCANNING INPUT STRUCTURAL METRICS...")

	// 1. Calculate raw bytes natively using standard string type properties
	byteSize := len(input)

	// 2. Count true character markers manually by stepping through the string as an isolated rune slice
	runeArray := []rune(input)
	trueCharCount := 0

	for range runeArray {
		trueCharCount++
	}

	// Return encapsulated metric properties cleanly
	return AnalysisMetrics{
		CharacterCount: trueCharCount,
		ByteSize:       byteSize,
	}
}
