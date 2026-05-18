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

// GenerateSocraticHint evaluates compilation payload dimensions and yields a structured diagnostic hint profile.
func (m AnalysisMetrics) GenerateSocraticHint() string {
	fmt.Println("🤖 EVALUATING HEURISTIC MATRIX RULES...")

	// Rule 1: Guardrail for dangerously small submissions
	if m.CharacterCount > 0 && m.CharacterCount < 5 {
		return "💡 Socratic Reflection: Your instructional payload is remarkably compact. Does this slice contain enough foundational context to satisfy the compiler's baseline constraints?"
	}

	// Rule 2: Ingress check for high-density architectures
	if m.ByteSize > m.CharacterCount {
		return "💡 Socratic Reflection: I notice an expansion in your byte footprint relative to your character count. Are you manipulating multi-byte Unicode runes or embedded graphic states inside this memory block?"
	}

	// Rule 3: Balanced standard profile fallback
	return "💡 Socratic Reflection: Structural dimensions align cleanly. The system state is balanced. Consider how optimizing the underlying type allocation structures could improve performance further."
}
