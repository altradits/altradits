package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

var usernameStripPattern = regexp.MustCompile(`[^a-z0-9]`)

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
	IsAdmin   bool   `json:"is_admin"`
}

// Claims is the JWT payload.
type Claims struct {
	UserID  string `json:"user_id"`
	Email   string `json:"email"`
	IsAdmin bool   `json:"is_admin"`
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

	username, err := s.generateUsername(ctx, input.Email)
	if err != nil {
		return nil, fmt.Errorf("failed to assign a Lightning address: %w", err)
	}

	// Create user
	var user User
	err = s.db.QueryRow(ctx, `
		INSERT INTO users (name, email, password_hash, username)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text, name, email, TO_CHAR(created_at, 'YYYY-MM-DD'), is_admin
	`, input.Name, input.Email, string(hash), username).
		Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt, &user.IsAdmin)
	if err != nil {
		return nil, fmt.Errorf("failed to create account: %w", err)
	}

	// Issue JWT
	token, err := s.issueToken(ctx, user.ID, user.Email, user.IsAdmin)
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
		       TO_CHAR(created_at, 'YYYY-MM-DD'), is_admin
		FROM users WHERE email = $1
	`, input.Email).Scan(&user.ID, &user.Name, &user.Email, &passwordHash, &isActive, &user.CreatedAt, &user.IsAdmin)
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
	token, err := s.issueToken(ctx, user.ID, user.Email, user.IsAdmin)
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
		SELECT id::text, name, email, TO_CHAR(created_at, 'YYYY-MM-DD'), is_admin
		FROM users WHERE id = $1::uuid AND is_active = TRUE
	`, userID).Scan(&user.ID, &user.Name, &user.Email, &user.CreatedAt, &user.IsAdmin)
	if err != nil {
		return nil, errors.New("user not found")
	}
	return &user, nil
}

// generateUsername derives a Lightning-address username from the local part
// of an email address, falling back to "user" and appending a numeric
// suffix until a unique value is found.
func (s *Service) generateUsername(ctx context.Context, email string) (string, error) {
	local, _, _ := strings.Cut(email, "@")
	base := usernameStripPattern.ReplaceAllString(strings.ToLower(local), "")
	if base == "" {
		base = "user"
	}

	username := base
	for i := 0; ; i++ {
		if i > 0 {
			username = fmt.Sprintf("%s%d", base, i)
		}
		var exists bool
		if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE username = $1)`, username).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return username, nil
		}
	}
}

// issueToken creates a signed JWT.
func (s *Service) issueToken(ctx context.Context, userID, email string, isAdmin bool) (string, error) {
	expiresAt := time.Now().Add(tokenExpiry)

	claims := &Claims{
		UserID:  userID,
		Email:   email,
		IsAdmin: isAdmin,
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

	return signed, nil
}

// SeedAdmin ensures the admin account configured via ADMIN_EMAIL /
// ADMIN_PASSWORD exists and has admin privileges. If neither is set, it does
// nothing. If the account already exists, only its admin flag is promoted —
// its password is left untouched.
func (s *Service) SeedAdmin(ctx context.Context) error {
	email := strings.ToLower(strings.TrimSpace(os.Getenv("ADMIN_EMAIL")))
	password := os.Getenv("ADMIN_PASSWORD")
	if email == "" || password == "" {
		return nil
	}

	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists); err != nil {
		return fmt.Errorf("failed to check for admin account: %w", err)
	}

	if exists {
		_, err := s.db.Exec(ctx, `UPDATE users SET is_admin = true WHERE email = $1`, email)
		if err != nil {
			return fmt.Errorf("failed to promote admin account: %w", err)
		}
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return fmt.Errorf("failed to secure admin password: %w", err)
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO users (name, email, password_hash, is_admin)
		VALUES ('Admin', $1, $2, true)
	`, email, string(hash))
	if err != nil {
		return fmt.Errorf("failed to create admin account: %w", err)
	}

	return nil
}
