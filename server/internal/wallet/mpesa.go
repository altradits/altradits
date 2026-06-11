package wallet

import (
	"context"
	"fmt"
	"math/rand"
	"regexp"
	"strings"
)

// MpesaProvider abstracts M-Pesa STK push (deposits) and B2C (withdrawals).
// The mock implementation simulates Safaricom's Daraja API for local
// development. A real Daraja-backed implementation can satisfy the same
// interface and be swapped in via NewMpesaProvider without touching callers.
type MpesaProvider interface {
	// STKPush prompts the user's phone to enter their M-Pesa PIN to confirm
	// a deposit of amountKES.
	STKPush(ctx context.Context, phone string, amountKES float64, accountRef string) (*MpesaResult, error)
	// B2C sends amountKES from the business shortcode to the user's phone.
	B2C(ctx context.Context, phone string, amountKES float64, remarks string) (*MpesaResult, error)
}

// MpesaResult is the outcome of an M-Pesa STK push or B2C payout.
type MpesaResult struct {
	TransactionID string
	Success       bool
	Message       string
}

var kenyanPhoneRe = regexp.MustCompile(`^(?:254|0)?(7\d{8}|1\d{8})$`)

// NormalizeMpesaPhone converts a Kenyan phone number (07XXXXXXXX,
// +2547XXXXXXXX, 2547XXXXXXXX, ...) into the 2547XXXXXXXX / 2541XXXXXXXX
// format Daraja expects. Returns an error if the number doesn't look like a
// Kenyan mobile number.
func NormalizeMpesaPhone(phone string) (string, error) {
	cleaned := strings.ReplaceAll(strings.TrimSpace(phone), " ", "")
	cleaned = strings.TrimPrefix(cleaned, "+")

	matches := kenyanPhoneRe.FindStringSubmatch(cleaned)
	if matches == nil {
		return "", fmt.Errorf("enter a valid Kenyan phone number, e.g. 0712345678")
	}
	return "254" + matches[1], nil
}

// NewMpesaProvider returns the M-Pesa provider to use. Today this is always
// the mock provider; a real Daraja implementation can be selected here based
// on MPESA_PROVIDER once sandbox/production credentials are available.
func NewMpesaProvider() MpesaProvider {
	return &MockMpesaProvider{}
}

// MockMpesaProvider simulates Safaricom Daraja for local development. STK
// pushes and B2C payouts complete synchronously and instantly so the wallet
// is fully testable without sandbox credentials or a phone.
type MockMpesaProvider struct{}

// STKPush simulates a successful, instantly-confirmed deposit prompt.
func (m *MockMpesaProvider) STKPush(ctx context.Context, phone string, amountKES float64, accountRef string) (*MpesaResult, error) {
	return &MpesaResult{
		TransactionID: mockMpesaReceipt(),
		Success:       true,
		Message:       fmt.Sprintf("STK push of KSh %.2f to %s confirmed (mock).", amountKES, phone),
	}, nil
}

// B2C simulates a successful, instant payout to the user's phone.
func (m *MockMpesaProvider) B2C(ctx context.Context, phone string, amountKES float64, remarks string) (*MpesaResult, error) {
	return &MpesaResult{
		TransactionID: mockMpesaReceipt(),
		Success:       true,
		Message:       fmt.Sprintf("KSh %.2f sent to %s (mock).", amountKES, phone),
	}, nil
}

// mockMpesaReceipt generates a Daraja-shaped receipt number, e.g. MOCKAB12CD.
func mockMpesaReceipt() string {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 6)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return "MOCK" + string(b)
}
