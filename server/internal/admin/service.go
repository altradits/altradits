package admin

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Service provides bank-wide oversight queries for admin users: aggregate
// stats, the full user list, and a cross-user transaction feed.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates the admin service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// BankStats summarizes the wallet ledger across every user — the "bank's"
// books at a glance.
type BankStats struct {
	TotalUsers          int   `json:"total_users"`
	ActiveUsers         int   `json:"active_users"`
	TotalSatsBalance    int64 `json:"total_sats_balance"`
	TotalSatsReceived   int64 `json:"total_sats_received"`
	TotalSatsWithdrawn  int64 `json:"total_sats_withdrawn"`
	TotalTransactions   int   `json:"total_transactions"`
	PendingTransactions int   `json:"pending_transactions"`
}

// GetBankStats aggregates totals across the users and wallet_transactions
// tables.
func (s *Service) GetBankStats(ctx context.Context) (*BankStats, error) {
	var stats BankStats
	err := s.db.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE is_active),
			COALESCE(SUM(current_sats_balance), 0),
			COALESCE(SUM(total_sats_received), 0),
			COALESCE(SUM(total_sats_withdrawn), 0)
		FROM users
	`).Scan(&stats.TotalUsers, &stats.ActiveUsers, &stats.TotalSatsBalance, &stats.TotalSatsReceived, &stats.TotalSatsWithdrawn)
	if err != nil {
		return nil, err
	}

	err = s.db.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'pending')
		FROM wallet_transactions
	`).Scan(&stats.TotalTransactions, &stats.PendingTransactions)
	if err != nil {
		return nil, err
	}

	return &stats, nil
}

// User is a user account as seen by the admin dashboard.
type User struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	Email              string     `json:"email"`
	IsAdmin            bool       `json:"is_admin"`
	IsActive           bool       `json:"is_active"`
	CurrentSatsBalance int64      `json:"current_sats_balance"`
	TotalSatsReceived  int64      `json:"total_sats_received"`
	TotalSatsWithdrawn int64      `json:"total_sats_withdrawn"`
	CreatedAt          time.Time  `json:"created_at"`
	LastLogin          *time.Time `json:"last_login,omitempty"`
}

// ListUsers returns every user account, most recently created first.
func (s *Service) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id::text, name, email, is_admin, is_active,
		       current_sats_balance, total_sats_received, total_sats_withdrawn,
		       created_at, last_login
		FROM users ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.IsAdmin, &u.IsActive, &u.CurrentSatsBalance, &u.TotalSatsReceived, &u.TotalSatsWithdrawn, &u.CreatedAt, &u.LastLogin); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// Transaction is a wallet transaction enriched with the owning user's
// identity, for the admin activity feed.
type Transaction struct {
	ID          string     `json:"id"`
	UserName    string     `json:"user_name"`
	UserEmail   string     `json:"user_email"`
	AmountSats  int64      `json:"amount_sats"`
	AmountKES   *float64   `json:"amount_kes,omitempty"`
	Type        string     `json:"type"`
	Status      string     `json:"status"`
	Description string     `json:"description"`
	CreatedAt   time.Time  `json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// ListTransactions returns the most recent transactions across all users.
func (s *Service) ListTransactions(ctx context.Context, limit int) ([]Transaction, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.db.Query(ctx, `
		SELECT t.id, u.name, u.email, t.amount_sats, t.amount_kes, t.type, t.status, t.description, t.created_at, t.completed_at
		FROM wallet_transactions t
		JOIN users u ON u.id = t.user_id
		ORDER BY t.created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	transactions := []Transaction{}
	for rows.Next() {
		var t Transaction
		if err := rows.Scan(&t.ID, &t.UserName, &t.UserEmail, &t.AmountSats, &t.AmountKES, &t.Type, &t.Status, &t.Description, &t.CreatedAt, &t.CompletedAt); err != nil {
			return nil, err
		}
		transactions = append(transactions, t)
	}
	return transactions, rows.Err()
}
