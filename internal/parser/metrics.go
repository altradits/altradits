package parser

import (
	"fmt"
)

// AnalysisMetrics captures structural payload dimensions safely.
type AnalysisMetrics struct {
	CharacterCount int
	ByteSize       int
}

// CognitiveTier defines the developer's contextual guidance state.
type CognitiveTier string

const (
	TierDiscovery CognitiveTier = "DISCOVERY_MODE" // High assistance, detailed questions
	TierChallenge CognitiveTier = "CHALLENGE_MODE" // Balanced assistance, conceptual hints
	TierForge     CognitiveTier = "FORGE_MODE"     // Minimal assistance, strict architectural critiques
)

// AnalyzeInputPayload processes string attributes from first principles.
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

// EvaluateDeveloperProfile processes interactions to dynamically assign a Cognitive Guidance Tier.
func (m AnalysisMetrics) EvaluateDeveloperProfile(totalInteractions int64) CognitiveTier {
	fmt.Println("🤖 PARSER MATRIX: EVALUATING COGNITIVE PROFILE TIER...")

	// Condition 1: Low interaction history indicates early exploration stage
	if totalInteractions <= 1 {
		return TierDiscovery
	}

	// Condition 2: Medium interaction metrics indicate a stable challenge vector
	if totalInteractions > 1 && totalInteractions <= 5 {
		return TierChallenge
	}

	// Condition 3: Deep historical interactions trigger elite high-pressure forge rules
	return TierForge
}

// FormatSocraticResponse generates a custom mentorship message matched precisely to the user's Cognitive Tier
func FormatSocraticResponse(tier CognitiveTier) string {
	switch tier {
	case TierDiscovery:
		return "✨ [ALTRADITS ASSISTANT - DISCOVERY] Break the problem down into small parts. What is the explicit responsibility of this specific variable block?"
	case TierChallenge:
		return "⚡ [ALTRADITS ASSISTANT - CHALLENGE] Observe the structural behavior of the state machine. Are your data structures shifting predictably across memory cycles?"
	case TierForge:
		return "🔥 [ALTRADITS ASSISTANT - FORGE] State boundaries are vulnerable to side-effects. Eliminate redundant allocations and enforce complete thread-isolation constraints immediately."
	default:
		return "🎯 [ALTRADITS ASSISTANT] Keep refining the logic from first principles."
	}
}
