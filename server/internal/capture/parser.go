package capture

import (
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// ParsedEntry is the result of parsing a single line of natural language input.
type ParsedEntry struct {
	RawInput    string
	Description string
	Amount      float64
	Category    string
}

// Parse takes a raw input string like "Lunch 300" or "Oak 5k"
// and returns a ParsedEntry with best-effort classification.
func Parse(raw string) (*ParsedEntry, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("input is empty")
	}

	// Split into tokens
	tokens := strings.Fields(raw)
	if len(tokens) < 2 {
		return nil, fmt.Errorf("input needs at least a description and an amount: got %q", raw)
	}

	// Find the amount token — scan from the end
	var amountRaw string
	var descTokens []string

	for i := len(tokens) - 1; i >= 0; i-- {
		val, err := parseAmount(tokens[i])
		if err == nil && val > 0 {
			amountRaw = tokens[i]
			descTokens = tokens[:i]
			_ = amountRaw
			amount := val
			description := strings.Join(descTokens, " ")
			if description == "" {
				description = raw
			}
			return &ParsedEntry{
				RawInput:    raw,
				Description: description,
				Amount:      amount,
				Category:    classify(description),
			}, nil
		}
	}

	return nil, fmt.Errorf("could not find a valid amount in %q", raw)
}

// parseAmount converts "300", "2k", "2,000", "1.5k" to a float64.
func parseAmount(s string) (float64, error) {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, ",", "")

	multiplier := 1.0
	if strings.HasSuffix(s, "k") {
		multiplier = 1000
		s = strings.TrimSuffix(s, "k")
	} else if strings.HasSuffix(s, "m") {
		multiplier = 1_000_000
		s = strings.TrimSuffix(s, "m")
	}

	// Remove currency prefixes
	s = strings.TrimLeftFunc(s, func(r rune) bool {
		return !unicode.IsDigit(r) && r != '.'
	})

	val, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, err
	}
	return val * multiplier, nil
}

// classify maps a description to a spending category.
func classify(desc string) string {
	desc = strings.ToLower(desc)

	categories := map[string][]string{
		"food":        {"lunch", "food", "dinner", "breakfast", "snack", "meal", "restaurant", "cafe", "naivas", "quickmart", "eat"},
		"transport":   {"fuel", "uber", "bolt", "matatu", "bus", "fare", "transport", "petrol", "bodaboda"},
		"family":      {"mum", "mom", "dad", "brother", "sister", "family", "send", "sent"},
		"investments": {"oak", "mmf", "tbill", "bond", "etf", "invest", "fund", "sacco"},
		"bills":       {"rent", "water", "electricity", "wifi", "internet", "kplc", "nairobi water"},
		"fun":         {"movie", "netflix", "spotify", "game", "fun", "entertainment", "outing"},
		"savings":     {"save", "savings", "emergency", "target"},
		"health":      {"hospital", "clinic", "pharmacy", "doctor", "medicine", "chemist"},
	}

	for category, keywords := range categories {
		for _, kw := range keywords {
			if strings.Contains(desc, kw) {
				return category
			}
		}
	}

	return "uncategorized"
}