package sms

import (
	"regexp"
	"strconv"
	"strings"
)

// ParsedSMS is the result of parsing a raw SMS string.
type ParsedSMS struct {
	Sender     string
	Amount     float64
	Currency   string
	TxType     string // "debit", "credit", "transfer"
	Recipient  string
	Reference  string
	Balance    float64
	HasBalance bool
	Confidence int // 0-100
	Category   string
	RawDesc    string
}

// Parse attempts to extract transaction data from a raw SMS string.
// It tries each known format in order of specificity.
func Parse(raw string) *ParsedSMS {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	parsers := []func(string) *ParsedSMS{
		parseMpesaSend,
		parseMpesaReceive,
		parseMpesaPayBill,
		parseMpesaBuyGoods,
		parseMpesaWithdraw,
		parseMpesaDeposit,
		parseEquityDebit,
		parseEquityCredit,
		parseKCBDebit,
		parseGenericDebit,
	}

	for _, p := range parsers {
		if result := p(raw); result != nil {
			result.RawDesc = raw
			result.Category = classify(result)
			return result
		}
	}

	// Last resort: try to extract any amount from the text
	return parseGenericAmount(raw)
}

// ── M-Pesa parsers ───────────────────────────────────────────────────────────

// parseMpesaSend handles: "Ksh 2,000 sent to Jane Doe 0712345678 on 31/5/26..."
func parseMpesaSend(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)Ksh\s*([\d,]+(?:\.\d{2})?)\s+sent\s+to\s+([^0-9\n]+?)(?:\s+\d{10,12})?(?:\s+on\s+\d)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	return &ParsedSMS{
		Sender:     "MPESA",
		Amount:     amount,
		Currency:   "KES",
		TxType:     "debit",
		Recipient:  strings.TrimSpace(m[2]),
		Confidence: 90,
	}
}

// parseMpesaReceive handles: "You have received Ksh 5,000 from John Doe..."
func parseMpesaReceive(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)You have received Ksh\s*([\d,]+(?:\.\d{2})?)\s+from\s+([^0-9\n]+?)(?:\s+\d{10,12})?(?:\s+on\s+\d)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	return &ParsedSMS{
		Sender:     "MPESA",
		Amount:     amount,
		Currency:   "KES",
		TxType:     "credit",
		Recipient:  strings.TrimSpace(m[2]),
		Confidence: 90,
	}
}

// parseMpesaPayBill handles: "Ksh 2,500 paid to ZUKU FIBER account number..."
func parseMpesaPayBill(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)Ksh\s*([\d,]+(?:\.\d{2})?)\s+paid\s+to\s+([A-Z][A-Z\s]+?)(?:\s+account|\s+on\s+\d)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	return &ParsedSMS{
		Sender:     "MPESA",
		Amount:     amount,
		Currency:   "KES",
		TxType:     "debit",
		Recipient:  strings.TrimSpace(m[2]),
		Confidence: 88,
	}
}

// parseMpesaBuyGoods handles: "Ksh 350 paid to NAIVAS SUPERMARKET..."
func parseMpesaBuyGoods(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)Ksh\s*([\d,]+(?:\.\d{2})?)\s+paid\s+to\s+([A-Z][A-Z\s]+?)(?:\.\s+New|[.\n])`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	return &ParsedSMS{
		Sender:     "MPESA",
		Amount:     amount,
		Currency:   "KES",
		TxType:     "debit",
		Recipient:  strings.TrimSpace(m[2]),
		Confidence: 85,
	}
}

// parseMpesaWithdraw handles: "Ksh 3,000 withdrawn from agent..."
func parseMpesaWithdraw(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)Ksh\s*([\d,]+(?:\.\d{2})?)\s+withdrawn`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	return &ParsedSMS{
		Sender:     "MPESA",
		Amount:     amount,
		Currency:   "KES",
		TxType:     "debit",
		Recipient:  "Agent withdrawal",
		Confidence: 85,
	}
}

// parseMpesaDeposit handles: "Ksh 10,000 deposited to your M-PESA..."
func parseMpesaDeposit(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)Ksh\s*([\d,]+(?:\.\d{2})?)\s+deposited`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	return &ParsedSMS{
		Sender:     "MPESA",
		Amount:     amount,
		Currency:   "KES",
		TxType:     "credit",
		Recipient:  "M-Pesa deposit",
		Confidence: 82,
	}
}

// ── Equity Bank parsers ───────────────────────────────────────────────────────

// parseEquityDebit handles Equity Bank debit alerts.
func parseEquityDebit(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)(?:Equity|EazzyBanking).*?Debited.*?KES\s*([\d,]+(?:\.\d{2})?).*?(?:to|for)\s+([^\n.]+)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		// Try alternate format
		re2 := regexp.MustCompile(`(?i)KES\s*([\d,]+(?:\.\d{2})?)\s+debited`)
		m2 := re2.FindStringSubmatch(raw)
		if m2 == nil {
			return nil
		}
		return &ParsedSMS{
			Sender:     "Equity Bank",
			Amount:     parseAmount(m2[1]),
			Currency:   "KES",
			TxType:     "debit",
			Recipient:  "Equity debit",
			Confidence: 75,
		}
	}
	return &ParsedSMS{
		Sender:     "Equity Bank",
		Amount:     parseAmount(m[1]),
		Currency:   "KES",
		TxType:     "debit",
		Recipient:  strings.TrimSpace(m[2]),
		Confidence: 80,
	}
}

// parseEquityCredit handles Equity Bank credit alerts.
func parseEquityCredit(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)(?:Equity|EazzyBanking).*?Credited.*?KES\s*([\d,]+(?:\.\d{2})?)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	return &ParsedSMS{
		Sender:     "Equity Bank",
		Amount:     parseAmount(m[1]),
		Currency:   "KES",
		TxType:     "credit",
		Recipient:  "Equity credit",
		Confidence: 78,
	}
}

// parseKCBDebit handles KCB Bank debit alerts.
func parseKCBDebit(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)KCB.*?KES\s*([\d,]+(?:\.\d{2})?).*?(?:debit|debited|withdrawn)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		re2 := regexp.MustCompile(`(?i)(?:debit|debited|withdrawn).*?KES\s*([\d,]+(?:\.\d{2})?)`)
		m2 := re2.FindStringSubmatch(raw)
		if m2 == nil {
			return nil
		}
		return &ParsedSMS{
			Sender:     "KCB Bank",
			Amount:     parseAmount(m2[1]),
			Currency:   "KES",
			TxType:     "debit",
			Recipient:  "KCB debit",
			Confidence: 72,
		}
	}
	return &ParsedSMS{
		Sender:     "KCB Bank",
		Amount:     parseAmount(m[1]),
		Currency:   "KES",
		TxType:     "debit",
		Recipient:  "KCB debit",
		Confidence: 75,
	}
}

// parseGenericDebit is a catch-all for any SMS with a KES/Ksh amount.
func parseGenericDebit(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(?i)(?:KES|Ksh|KSH)\s*([\d,]+(?:\.\d{2})?)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	txType := "debit"
	if regexp.MustCompile(`(?i)received|credited|credit|deposit`).MatchString(raw) {
		txType = "credit"
	}
	return &ParsedSMS{
		Sender:     "Unknown",
		Amount:     amount,
		Currency:   "KES",
		TxType:     txType,
		Recipient:  "Unknown",
		Confidence: 55,
	}
}

// parseGenericAmount is the final fallback — tries to find any number.
func parseGenericAmount(raw string) *ParsedSMS {
	re := regexp.MustCompile(`(\d{3,}(?:,\d{3})*(?:\.\d{2})?)`)
	m := re.FindStringSubmatch(raw)
	if m == nil {
		return nil
	}
	amount := parseAmount(m[1])
	if amount <= 0 {
		return nil
	}
	return &ParsedSMS{
		Sender:     "Unknown",
		Amount:     amount,
		Currency:   "KES",
		TxType:     "debit",
		Recipient:  "Unknown",
		Confidence: 30,
		RawDesc:    raw,
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// parseAmount converts "2,000", "2000", "2,000.50" to float64.
func parseAmount(s string) float64 {
	s = strings.ReplaceAll(s, ",", "")
	s = strings.TrimSpace(s)
	val, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return val
}

// classify maps parsed SMS data to an Altradits spending category.
func classify(p *ParsedSMS) string {
	if p.TxType == "credit" {
		return "income"
	}

	recipient := strings.ToLower(p.Recipient)
	keywords := map[string][]string{
		"food":        {"naivas", "quickmart", "carrefour", "food", "restaurant", "cafe", "java", "kfc", "eat"},
		"transport":   {"uber", "bolt", "fuel", "petrol", "shell", "total", "kenol", "matatu", "bus", "fare"},
		"bills":       {"zuku", "safaricom home", "kplc", "nairobi water", "rent", "electricity", "wifi", "internet"},
		"investments": {"oak", "sacco", "mmf", "cic", "britam", "co-op", "equity invest", "fund"},
		"health":      {"hospital", "clinic", "pharmacy", "chemist", "doctor", "medical", "mpharma"},
		"family":      {"mum", "mom", "dad", "brother", "sister", "spouse", "wife", "husband"},
		"fun":         {"netflix", "showmax", "spotify", "dstv", "gotv", "cinema", "movie"},
		"savings":     {"savings", "emergency", "goal", "fixed deposit"},
	}

	for category, words := range keywords {
		for _, word := range words {
			if strings.Contains(recipient, word) {
				return category
			}
		}
	}

	return "uncategorized"
}
