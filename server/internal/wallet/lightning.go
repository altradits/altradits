package wallet

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"
)

// LightningProvider abstracts Lightning invoice creation and payment. The
// mock implementation generates well-formed-looking invoices and payment
// hashes for local development. A real LND-backed implementation can satisfy
// the same interface and be swapped in via NewLightningProvider without
// touching callers.
type LightningProvider interface {
	// CreateInvoice generates a new Lightning invoice for receiving sats.
	CreateInvoice(ctx context.Context, amountSats int64, memo string) (*Invoice, error)
	// PayInvoice pays a bolt11 invoice or Lightning address, sending
	// amountSats to it.
	PayInvoice(ctx context.Context, destination string, amountSats int64) (*Payment, error)
}

// Invoice is a Lightning payment request awaiting payment.
type Invoice struct {
	PaymentRequest string // bolt11
	PaymentHash    string
	AmountSats     int64
	ExpiresAt      time.Time
}

// Payment is the result of paying out over Lightning.
type Payment struct {
	PaymentHash     string
	PaymentPreimage string
	FeeSats         int64
}

// NewLightningProvider returns the Lightning provider to use. Today this is
// always the mock provider; a real LND implementation can be selected here
// based on LIGHTNING_PROVIDER once a node is reachable.
func NewLightningProvider() LightningProvider {
	return &MockLightningProvider{}
}

// MockLightningProvider simulates an LND node for local development.
// Invoices are generated locally and payments succeed instantly with zero
// routing fee, so the wallet is fully testable without a Lightning node.
type MockLightningProvider struct{}

// CreateInvoice generates a bolt11-shaped invoice that encodes the amount in
// its prefix, purely for local readability — it is not a valid invoice.
func (m *MockLightningProvider) CreateInvoice(ctx context.Context, amountSats int64, memo string) (*Invoice, error) {
	if amountSats <= 0 {
		return nil, fmt.Errorf("invoice amount must be greater than zero")
	}
	hash := randomHex(32)
	return &Invoice{
		PaymentRequest: fmt.Sprintf("lnbc%dn1mock%s", amountSats, hash[:24]),
		PaymentHash:    hash,
		AmountSats:     amountSats,
		ExpiresAt:      time.Now().Add(1 * time.Hour),
	}, nil
}

// PayInvoice simulates an instant, fee-free Lightning payment.
func (m *MockLightningProvider) PayInvoice(ctx context.Context, destination string, amountSats int64) (*Payment, error) {
	destination = strings.TrimSpace(destination)
	if destination == "" {
		return nil, fmt.Errorf("a Lightning invoice or address is required")
	}
	if amountSats <= 0 {
		return nil, fmt.Errorf("payment amount must be greater than zero")
	}
	return &Payment{
		PaymentHash:     randomHex(32),
		PaymentPreimage: randomHex(32),
		FeeSats:         0,
	}, nil
}

func randomHex(n int) string {
	b := make([]byte, n/2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
