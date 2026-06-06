package users

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Service handles user database operations.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates a new users service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

// User represents a user in the system.
type User struct {
	ID        string `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	CreatedAt string `json:"created_at"`
}

// Create creates a new user with hashed password.
func (s *Service) Create(ctx context.Context, email, name, password string) (*User, error) {
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	var user User
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (email, name, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id::text, email, name, TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, email, name, string(hashedPassword)).Scan(
		&user.ID, &user.Email, &user.Name, &user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// FindByEmail finds a user by email and returns the password hash for verification.
func (s *Service) FindByEmail(ctx context.Context, email string) (*User, string, error) {
	var user User
	var passwordHash string
	err := s.db.QueryRow(ctx, `
		SELECT id::text, email, name, password_hash, TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM users
		WHERE email = $1
	`, email).Scan(
		&user.ID, &user.Email, &user.Name, &passwordHash, &user.CreatedAt,
	)
	if err != nil {
		return nil, "", errors.New("user not found")
	}

	return &user, passwordHash, nil
}

// GetByID retrieves a user by ID.
func (s *Service) GetByID(ctx context.Context, userID string) (*User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		SELECT id::text, email, name, TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM users
		WHERE id = $1::uuid
	`, userID).Scan(
		&user.ID, &user.Email, &user.Name, &user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// VerifyPassword checks if the provided password matches the hash.
func VerifyPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
