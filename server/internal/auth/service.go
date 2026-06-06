package auth

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const (
	tokenExpiry = 7 * 24 * time.Hour // 7 days
	bcryptCost  = 12
)

// RegisterInput is the request body for registration.
type RegisterInput struct {
	Name     string `json:"name"     binding:"required,min=2"`
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

// LoginInput is the request body for login.
type LoginInput struct {
	Email    string `json:"email"    binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// AuthResponse is returned after successful register or login.
type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// User is the public user profile (no password).
type User struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	CreatedAt string `json:"created_at"`
}

// Claims is the JWT payload.
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	jwt.RegisteredClaims
}

// Service handles authentication.
type Service struct {
	db        *pgxpool.Pool
	jwtSecret []byte
}

// NewService creates a new auth service.
func NewService(db *pgxpool.Pool) *Service {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "altradits-dev-secret-change-in-production"
	}
	return &Service{db: db, jwtSecret: []byte(secret)}
}

// Register creates a new user account.
func (s *Service) Register(ctx context.Context, input RegisterInput) (*AuthResponse, error) {
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))

	// Check if email already exists
	var exists bool
	_ = s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, input.Email).Scan(&exists)
	if exists {
		return nil, errors.New("an account with this email already exists")
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("failed to secure password: %w", err)
	}

	// Create user
	var user User
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (name, email, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id::text, name, email, TO_CHAR(created_at, 'YYYY-MM-DD')
	`, input.Name, input.Email, string(hash)).
		Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	// Issue JWT
	token, err := s.issueToken(ctx, user.ID, user.Email)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{Token: token, User: user}, nil
}

// Login authenticates a user and issues a JWT.
func (s *Service) Login(ctx context.Context, input LoginInput) (*AuthResponse, error) {
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))

	// Fetch user
	var user User
	var passwordHash string
	var isActive bool
	err := s.db.QueryRow(ctx, `
		SELECT id::text, name, email, password_hash, is_active,
		       TO_CHAR(created_at, 'YYYY-MM-DD')
		FROM users WHERE email = $1
	`, input.Email).Scan(&user.ID, &user.Name, &user.Email, &passwordHash, &isActive, &user.CreatedAt)
	if err != nil {
		// Use same error message for not found and wrong password
		return nil, errors.New("email or password is incorrect")
	}

	if !isActive {
		return nil, errors.New("this account is not active")
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(input.Password)); err != nil {
		return nil, errors.New("email or password is incorrect")
	}

	// Update last login
	_, _ = s.db.Exec(ctx, `UPDATE users SET last_login = NOW() WHERE id = $1::uuid`, user.ID)

	// Issue JWT
	token, err := s.issueToken(ctx, user.ID, user.Email)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{Token: token, User: user}, nil
}

// Verify parses and validates a JWT, returning the claims.
func (s *Service) Verify(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

// Me returns the current user's profile.
func (s *Service) Me(ctx context.Context, userID string) (*User, error) {
	var user User
	err := s.db.QueryRow(ctx, `
		SELECT id::text, name, email, TO_CHAR(created_at, 'YYYY-MM-DD')
		FROM users WHERE id = $1::uuid AND is_active = TRUE
	`, userID).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt)
	if err != nil {
		return nil, errors.New("user not found")
	}
	return &user, nil
}

// Logout revokes the current session token.
func (s *Service) Logout(ctx context.Context, tokenString string) error {
	hash := tokenHash(tokenString)
	_, err := s.db.Exec(ctx, `
		UPDATE sessions SET revoked = TRUE WHERE token_hash = $1
	`, hash)
	return err
}

// issueToken creates a signed JWT and stores the session.
func (s *Service) issueToken(ctx context.Context, userID, email string) (string, error) {
	expiresAt := time.Now().Add(tokenExpiry)

	claims := &Claims{
		UserID: userID,
		Email:  email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.jwtSecret)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	// Store session
	hash := tokenHash(signed)
	_, _ = s.db.Exec(ctx, `
		INSERT INTO sessions (user_id, token_hash, expires_at)
		VALUES ($1::uuid, $2, $3)
		ON CONFLICT (token_hash) DO NOTHING
	`, userID, hash, expiresAt)

	return signed, nil
}

// tokenHash returns a SHA-256 hash of the token for safe storage.
func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum)
}
