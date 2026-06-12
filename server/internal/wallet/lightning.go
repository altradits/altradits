package wallet

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// LightningProvider abstracts Lightning invoice creation and payment. The
// mock implementation generates well-formed-looking invoices and payment
// hashes for local development. LNDLightningProvider talks to a real LND
// node over its REST API and is selected automatically by
// NewLightningProvider when LND_REST_HOST is configured and reachable.
type LightningProvider interface {
	// CreateInvoice generates a new Lightning invoice for receiving sats.
	CreateInvoice(ctx context.Context, amountSats int64, memo string) (*Invoice, error)
	// PayInvoice pays a bolt11 invoice or Lightning address, sending
	// amountSats to it.
	PayInvoice(ctx context.Context, destination string, amountSats int64) (*Payment, error)
	// CheckInvoice reports whether the invoice with the given (hex-encoded)
	// payment hash has been settled.
	CheckInvoice(ctx context.Context, paymentHash string) (bool, error)
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

// NewLightningProvider returns the Lightning provider to use. If
// LND_REST_HOST (and macaroon) are configured and the node responds to a
// getinfo call, a real LNDLightningProvider is returned. Otherwise the mock
// provider is used, so local development keeps working unchanged.
func NewLightningProvider() LightningProvider {
	host := strings.TrimRight(strings.TrimSpace(os.Getenv("LND_REST_HOST")), "/")
	if host == "" {
		return &MockLightningProvider{}
	}

	macaroon, err := loadLNDMacaroon()
	if err != nil {
		log.Printf("⚡ LND_REST_HOST is set but no macaroon is configured (%v) — using mock Lightning provider", err)
		return &MockLightningProvider{}
	}

	client, err := newLNDHTTPClient()
	if err != nil {
		log.Printf("⚡ could not configure TLS for LND_REST_HOST (%v) — using mock Lightning provider", err)
		return &MockLightningProvider{}
	}

	provider := &LNDLightningProvider{
		host:        host,
		macaroon:    macaroon,
		client:      client,
		lnurlClient: &http.Client{Timeout: 15 * time.Second},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	info, err := provider.getInfo(ctx)
	if err != nil {
		log.Printf("⚡ could not connect to LND node at %s (%v) — using mock Lightning provider", host, err)
		return &MockLightningProvider{}
	}

	log.Printf("⚡ connected to LND node %q at %s (version %s, synced_to_chain=%v)", info.Alias, host, info.Version, info.SyncedToChain)
	return provider
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

// CheckInvoice always reports unsettled — the mock provider has no real
// node to receive a payment from. Use the "simulate payment received"
// endpoint to mark a mock invoice as paid.
func (m *MockLightningProvider) CheckInvoice(ctx context.Context, paymentHash string) (bool, error) {
	return false, nil
}

func randomHex(n int) string {
	b := make([]byte, n/2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// LNDLightningProvider talks to a real LND node over its REST API. It is
// configured via environment variables:
//
//	LND_REST_HOST                 e.g. https://127.0.0.1:8080 (required)
//	LND_MACAROON_HEX              hex-encoded macaroon (or LND_MACAROON_PATH)
//	LND_MACAROON_PATH             path to a macaroon file, e.g. invoice.macaroon
//	LND_TLS_CERT_PATH             path to LND's tls.cert (optional)
//	LND_TLS_INSECURE_SKIP_VERIFY  "true" to skip TLS verification (dev only,
//	                              used when LND_TLS_CERT_PATH is not set)
type LNDLightningProvider struct {
	host     string
	macaroon string

	// client talks to the LND node itself.
	client *http.Client
	// lnurlClient talks to third-party LNURL endpoints for Lightning
	// Address payments and always verifies TLS normally, regardless of how
	// the LND node's certificate is configured.
	lnurlClient *http.Client
}

// CreateInvoice generates a real bolt11 invoice via LND's AddInvoice RPC.
func (p *LNDLightningProvider) CreateInvoice(ctx context.Context, amountSats int64, memo string) (*Invoice, error) {
	if amountSats <= 0 {
		return nil, fmt.Errorf("invoice amount must be greater than zero")
	}

	var resp struct {
		RHash          string `json:"r_hash"`
		PaymentRequest string `json:"payment_request"`
	}
	body := map[string]any{
		"value":  amountSats,
		"memo":   memo,
		"expiry": 3600,
	}
	if err := p.post(ctx, "/v1/invoices", body, &resp); err != nil {
		return nil, err
	}

	rHash, err := base64.StdEncoding.DecodeString(resp.RHash)
	if err != nil {
		return nil, fmt.Errorf("lightning node returned an invalid payment hash")
	}

	return &Invoice{
		PaymentRequest: resp.PaymentRequest,
		PaymentHash:    hex.EncodeToString(rHash),
		AmountSats:     amountSats,
		ExpiresAt:      time.Now().Add(1 * time.Hour),
	}, nil
}

// PayInvoice pays a bolt11 invoice, or a Lightning Address (user@domain),
// which is resolved to an invoice via LNURL-pay first.
func (p *LNDLightningProvider) PayInvoice(ctx context.Context, destination string, amountSats int64) (*Payment, error) {
	destination = strings.TrimSpace(destination)
	if destination == "" {
		return nil, fmt.Errorf("a Lightning invoice or address is required")
	}
	if amountSats <= 0 {
		return nil, fmt.Errorf("payment amount must be greater than zero")
	}

	bolt11 := strings.TrimPrefix(destination, "lightning:")
	if strings.Contains(bolt11, "@") {
		resolved, err := p.resolveLightningAddress(ctx, bolt11, amountSats)
		if err != nil {
			return nil, err
		}
		bolt11 = resolved
	}

	decoded, err := p.decodePayReq(ctx, bolt11)
	if err != nil {
		return nil, fmt.Errorf("could not decode invoice: %w", err)
	}

	sendBody := map[string]any{"payment_request": bolt11}
	if decoded.NumSatoshis == "0" {
		// Zero-amount ("amountless") invoices require the amount on send.
		sendBody["amt"] = amountSats
	}

	var sendResp struct {
		PaymentError    string `json:"payment_error"`
		PaymentPreimage string `json:"payment_preimage"`
		PaymentRoute    *struct {
			TotalFees string `json:"total_fees"`
		} `json:"payment_route"`
	}
	if err := p.post(ctx, "/v1/channels/transactions", sendBody, &sendResp); err != nil {
		return nil, err
	}
	if sendResp.PaymentError != "" {
		return nil, fmt.Errorf("payment failed: %s", sendResp.PaymentError)
	}

	preimage, err := base64.StdEncoding.DecodeString(sendResp.PaymentPreimage)
	if err != nil {
		return nil, fmt.Errorf("lightning node returned an invalid payment preimage")
	}

	var feeSats int64
	if sendResp.PaymentRoute != nil && sendResp.PaymentRoute.TotalFees != "" {
		feeSats, _ = strconv.ParseInt(sendResp.PaymentRoute.TotalFees, 10, 64)
	}

	return &Payment{
		PaymentHash:     decoded.PaymentHash,
		PaymentPreimage: hex.EncodeToString(preimage),
		FeeSats:         feeSats,
	}, nil
}

// CheckInvoice reports whether the invoice with the given (hex-encoded)
// payment hash has been settled, via LND's LookupInvoice RPC.
func (p *LNDLightningProvider) CheckInvoice(ctx context.Context, paymentHash string) (bool, error) {
	var resp struct {
		Settled bool   `json:"settled"`
		State   string `json:"state"`
	}
	if err := p.get(ctx, "/v1/invoice/"+paymentHash, &resp); err != nil {
		return false, err
	}
	return resp.Settled || resp.State == "SETTLED", nil
}

// resolveLightningAddress turns a user@domain Lightning Address into a
// bolt11 invoice for amountSats via the LNURL-pay protocol.
func (p *LNDLightningProvider) resolveLightningAddress(ctx context.Context, address string, amountSats int64) (string, error) {
	parts := strings.SplitN(address, "@", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", fmt.Errorf("invalid Lightning address %q", address)
	}
	user, domain := parts[0], parts[1]

	var meta struct {
		Callback    string `json:"callback"`
		MinSendable int64  `json:"minSendable"`
		MaxSendable int64  `json:"maxSendable"`
		Tag         string `json:"tag"`
	}
	metaURL := fmt.Sprintf("https://%s/.well-known/lnurlp/%s", domain, user)
	if err := getJSON(ctx, p.lnurlClient, metaURL, &meta); err != nil {
		return "", fmt.Errorf("could not resolve Lightning address %s: %w", address, err)
	}
	if meta.Tag != "payRequest" || meta.Callback == "" {
		return "", fmt.Errorf("%s does not support Lightning address payments", address)
	}

	amountMsat := amountSats * 1000
	if meta.MinSendable > 0 && amountMsat < meta.MinSendable {
		return "", fmt.Errorf("%s requires a minimum of %d sats", address, meta.MinSendable/1000)
	}
	if meta.MaxSendable > 0 && amountMsat > meta.MaxSendable {
		return "", fmt.Errorf("%s accepts at most %d sats", address, meta.MaxSendable/1000)
	}

	callbackURL, err := url.Parse(meta.Callback)
	if err != nil {
		return "", fmt.Errorf("%s returned an invalid callback URL", address)
	}
	q := callbackURL.Query()
	q.Set("amount", strconv.FormatInt(amountMsat, 10))
	callbackURL.RawQuery = q.Encode()

	var cb struct {
		PR     string `json:"pr"`
		Status string `json:"status"`
		Reason string `json:"reason"`
	}
	if err := getJSON(ctx, p.lnurlClient, callbackURL.String(), &cb); err != nil {
		return "", fmt.Errorf("could not request invoice from %s: %w", address, err)
	}
	if strings.EqualFold(cb.Status, "ERROR") {
		return "", fmt.Errorf("%s declined the payment: %s", address, cb.Reason)
	}
	if cb.PR == "" {
		return "", fmt.Errorf("%s did not return an invoice", address)
	}
	return cb.PR, nil
}

func (p *LNDLightningProvider) getInfo(ctx context.Context) (*struct {
	Alias         string `json:"alias"`
	Version       string `json:"version"`
	SyncedToChain bool   `json:"synced_to_chain"`
}, error) {
	var resp struct {
		Alias         string `json:"alias"`
		Version       string `json:"version"`
		SyncedToChain bool   `json:"synced_to_chain"`
	}
	if err := p.get(ctx, "/v1/getinfo", &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (p *LNDLightningProvider) decodePayReq(ctx context.Context, bolt11 string) (*struct {
	PaymentHash string `json:"payment_hash"`
	NumSatoshis string `json:"num_satoshis"`
}, error) {
	var resp struct {
		PaymentHash string `json:"payment_hash"`
		NumSatoshis string `json:"num_satoshis"`
	}
	if err := p.get(ctx, "/v1/payreq/"+url.PathEscape(bolt11), &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func (p *LNDLightningProvider) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.host+path, nil)
	if err != nil {
		return err
	}
	return p.do(req, out)
}

func (p *LNDLightningProvider) post(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.host+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return p.do(req, out)
}

func (p *LNDLightningProvider) do(req *http.Request, out any) error {
	req.Header.Set("Grpc-Metadata-macaroon", p.macaroon)
	resp, err := p.client.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach Lightning node: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("could not read Lightning node response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var apiErr struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		_ = json.Unmarshal(respBody, &apiErr)
		msg := apiErr.Message
		if msg == "" {
			msg = apiErr.Error
		}
		if msg == "" {
			msg = strings.TrimSpace(string(respBody))
		}
		return fmt.Errorf("lightning node error: %s", msg)
	}

	return json.Unmarshal(respBody, out)
}

// getJSON performs a plain GET request with normal TLS verification and
// decodes a JSON response. Used for LNURL-pay calls to third-party servers.
func getJSON(ctx context.Context, client *http.Client, rawURL string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// loadLNDMacaroon returns the hex-encoded macaroon to send with each request,
// either directly from LND_MACAROON_HEX or read from LND_MACAROON_PATH.
func loadLNDMacaroon() (string, error) {
	if hexMac := strings.TrimSpace(os.Getenv("LND_MACAROON_HEX")); hexMac != "" {
		return hexMac, nil
	}
	path := strings.TrimSpace(os.Getenv("LND_MACAROON_PATH"))
	if path == "" {
		return "", fmt.Errorf("set LND_MACAROON_HEX or LND_MACAROON_PATH")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("could not read LND_MACAROON_PATH: %w", err)
	}
	return hex.EncodeToString(raw), nil
}

// newLNDHTTPClient builds the HTTP client used to talk to the LND node's
// REST API, configuring TLS verification from LND_TLS_CERT_PATH or
// LND_TLS_INSECURE_SKIP_VERIFY if set.
func newLNDHTTPClient() (*http.Client, error) {
	transport := &http.Transport{}

	if certPath := strings.TrimSpace(os.Getenv("LND_TLS_CERT_PATH")); certPath != "" {
		certBytes, err := os.ReadFile(certPath)
		if err != nil {
			return nil, fmt.Errorf("could not read LND_TLS_CERT_PATH: %w", err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(certBytes) {
			return nil, fmt.Errorf("LND_TLS_CERT_PATH does not contain a valid PEM certificate")
		}
		transport.TLSClientConfig = &tls.Config{RootCAs: pool}
	} else if insecure := strings.TrimSpace(os.Getenv("LND_TLS_INSECURE_SKIP_VERIFY")); insecure == "true" || insecure == "1" {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}

	return &http.Client{Transport: transport, Timeout: 30 * time.Second}, nil
}
