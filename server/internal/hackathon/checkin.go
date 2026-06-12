package hackathon

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/altradits/altradits/server/internal/auth"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// CheckinCode is the organizer-generated code hackers submit to record
// attendance for a given day.
type CheckinCode struct {
	ID          string    `json:"id"`
	HackathonID string    `json:"hackathon_id"`
	DayNumber   int       `json:"day_number"`
	Code        string    `json:"code"`
	CreatedAt   time.Time `json:"created_at"`
}

// Checkin is a recorded attendance for a single day.
type Checkin struct {
	ID          string    `json:"id"`
	HackathonID string    `json:"hackathon_id"`
	UserID      string    `json:"user_id"`
	UserName    string    `json:"user_name,omitempty"`
	DayNumber   int       `json:"day_number"`
	CheckedInAt time.Time `json:"checked_in_at"`
}

// CheckinCodeInput is the request body for POST /hackathons/:id/checkin-codes.
type CheckinCodeInput struct {
	DayNumber int `json:"day_number" binding:"required"`
}

// CheckinInput is the request body for POST /hackathons/:id/checkin.
type CheckinInput struct {
	Code string `json:"code" binding:"required"`
}

const checkinCodeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

func generateCheckinCode() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = checkinCodeChars[int(b[i])%len(checkinCodeChars)]
	}
	return string(b), nil
}

// GenerateCheckinCode creates or rotates the check-in code for a given day.
// Organizer only.
func (s *Service) GenerateCheckinCode(ctx context.Context, userID, hackathonID string, input CheckinCodeInput) (*CheckinCode, error) {
	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return nil, err
	}
	if !isOrg {
		return nil, ErrNotOrganizer
	}
	if input.DayNumber < 1 {
		return nil, fmt.Errorf("day_number must be at least 1")
	}

	code, err := generateCheckinCode()
	if err != nil {
		return nil, err
	}

	var cc CheckinCode
	err = s.db.QueryRow(ctx, `
		INSERT INTO hackathon_checkin_codes (hackathon_id, day_number, code)
		VALUES ($1, $2, $3)
		ON CONFLICT (hackathon_id, day_number)
		DO UPDATE SET code = $3, created_at = NOW()
		RETURNING id, hackathon_id, day_number, code, created_at
	`, hackathonID, input.DayNumber, code).Scan(&cc.ID, &cc.HackathonID, &cc.DayNumber, &cc.Code, &cc.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &cc, nil
}

// ListCheckinCodes returns every check-in code for a hackathon. Organizer only.
func (s *Service) ListCheckinCodes(ctx context.Context, userID, hackathonID string) ([]*CheckinCode, error) {
	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return nil, err
	}
	if !isOrg {
		return nil, ErrNotOrganizer
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, hackathon_id, day_number, code, created_at
		FROM hackathon_checkin_codes
		WHERE hackathon_id = $1
		ORDER BY day_number ASC
	`, hackathonID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*CheckinCode
	for rows.Next() {
		var cc CheckinCode
		if err := rows.Scan(&cc.ID, &cc.HackathonID, &cc.DayNumber, &cc.Code, &cc.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, &cc)
	}
	return result, rows.Err()
}

// CheckIn records attendance for the day matching the given code. The
// requester must be an accepted hacker. Re-submitting the same day's code is
// idempotent.
func (s *Service) CheckIn(ctx context.Context, userID, hackathonID string, input CheckinInput) (*Checkin, error) {
	if err := s.requireAcceptedApplicant(ctx, userID, hackathonID); err != nil {
		return nil, err
	}

	var dayNumber int
	err := s.db.QueryRow(ctx, `
		SELECT day_number FROM hackathon_checkin_codes WHERE hackathon_id = $1 AND code = $2
	`, hackathonID, input.Code).Scan(&dayNumber)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCheckinCode
		}
		return nil, err
	}

	var ci Checkin
	err = s.db.QueryRow(ctx, `
		INSERT INTO hackathon_checkins (hackathon_id, user_id, day_number)
		VALUES ($1, $2, $3)
		ON CONFLICT (hackathon_id, user_id, day_number)
		DO UPDATE SET checked_in_at = hackathon_checkins.checked_in_at
		RETURNING id, hackathon_id, user_id, day_number, checked_in_at
	`, hackathonID, userID, dayNumber).Scan(&ci.ID, &ci.HackathonID, &ci.UserID, &ci.DayNumber, &ci.CheckedInAt)
	if err != nil {
		return nil, err
	}
	return &ci, nil
}

// ListCheckins returns attendance records: every check-in for organizers, or
// just the requesting user's own check-ins otherwise.
func (s *Service) ListCheckins(ctx context.Context, userID, hackathonID string) ([]*Checkin, error) {
	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT c.id, c.hackathon_id, c.user_id, u.name, c.day_number, c.checked_in_at
		FROM hackathon_checkins c
		JOIN users u ON u.id = c.user_id
		WHERE c.hackathon_id = $1
	`
	args := []any{hackathonID}
	if !isOrg {
		query += ` AND c.user_id = $2`
		args = append(args, userID)
	}
	query += ` ORDER BY c.day_number ASC, c.checked_in_at ASC`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Checkin
	for rows.Next() {
		var ci Checkin
		if err := rows.Scan(&ci.ID, &ci.HackathonID, &ci.UserID, &ci.UserName, &ci.DayNumber, &ci.CheckedInAt); err != nil {
			return nil, err
		}
		result = append(result, &ci)
	}
	return result, rows.Err()
}

// RegisterCheckinRoutes wires QR check-in endpoints onto the given router group.
func RegisterCheckinRoutes(api gin.IRouter, service *Service) {
	api.POST("/hackathons/:id/checkin-codes", generateCheckinCodeHandler(service))
	api.GET("/hackathons/:id/checkin-codes", listCheckinCodesHandler(service))
	api.POST("/hackathons/:id/checkin", checkInHandler(service))
	api.GET("/hackathons/:id/checkins", listCheckinsHandler(service))
}

func generateCheckinCodeHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input CheckinCodeInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "day_number is required"})
			return
		}
		cc, err := service.GenerateCheckinCode(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"checkin_code": cc, "message": fmt.Sprintf("Day %d check-in code: %s", cc.DayNumber, cc.Code)})
	}
}

func listCheckinCodesHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		list, err := service.ListCheckinCodes(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*CheckinCode{}
		}
		c.JSON(http.StatusOK, gin.H{"checkin_codes": list})
	}
}

func checkInHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input CheckinInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code is required"})
			return
		}
		ci, err := service.CheckIn(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"checkin": ci, "message": fmt.Sprintf("Checked in for Day %d. 👋", ci.DayNumber)})
	}
}

func listCheckinsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		list, err := service.ListCheckins(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*Checkin{}
		}
		c.JSON(http.StatusOK, gin.H{"checkins": list})
	}
}
