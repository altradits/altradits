package hackathon

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/altradits/altradits/server/internal/auth"
	"github.com/gin-gonic/gin"
)

// DailyNote is an organizer-authored note and resource list for a single day
// of a hackathon.
type DailyNote struct {
	ID          string    `json:"id"`
	HackathonID string    `json:"hackathon_id"`
	DayNumber   int       `json:"day_number"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	Resources   string    `json:"resources"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// DailyNoteInput is the request body for POST /hackathons/:id/notes.
type DailyNoteInput struct {
	DayNumber int    `json:"day_number" binding:"required"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	Resources string `json:"resources"`
}

// UpsertDailyNote creates or replaces the note for a given day. Organizer only.
func (s *Service) UpsertDailyNote(ctx context.Context, userID, hackathonID string, input DailyNoteInput) (*DailyNote, error) {
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

	var n DailyNote
	err = s.db.QueryRow(ctx, `
		INSERT INTO hackathon_daily_notes (hackathon_id, day_number, title, content, resources)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (hackathon_id, day_number)
		DO UPDATE SET title = $3, content = $4, resources = $5, updated_at = NOW()
		RETURNING id, hackathon_id, day_number, title, content, resources, created_at, updated_at
	`, hackathonID, input.DayNumber, input.Title, input.Content, input.Resources).Scan(
		&n.ID, &n.HackathonID, &n.DayNumber, &n.Title, &n.Content, &n.Resources, &n.CreatedAt, &n.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &n, nil
}

// ListDailyNotes returns every note for a hackathon, ordered by day. Only the
// organizer and accepted hackers may view them.
func (s *Service) ListDailyNotes(ctx context.Context, userID, hackathonID string) ([]*DailyNote, error) {
	if err := s.requireParticipant(ctx, userID, hackathonID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, hackathon_id, day_number, title, content, resources, created_at, updated_at
		FROM hackathon_daily_notes
		WHERE hackathon_id = $1
		ORDER BY day_number ASC
	`, hackathonID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*DailyNote
	for rows.Next() {
		var n DailyNote
		if err := rows.Scan(&n.ID, &n.HackathonID, &n.DayNumber, &n.Title, &n.Content, &n.Resources, &n.CreatedAt, &n.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, &n)
	}
	return result, rows.Err()
}

// RegisterNotesRoutes wires daily-notes endpoints onto the given router group.
func RegisterNotesRoutes(api gin.IRouter, service *Service) {
	api.POST("/hackathons/:id/notes", upsertNoteHandler(service))
	api.GET("/hackathons/:id/notes", listNotesHandler(service))
}

func upsertNoteHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input DailyNoteInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "day_number is required"})
			return
		}
		n, err := service.UpsertDailyNote(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"note": n, "message": fmt.Sprintf("Day %d notes saved.", n.DayNumber)})
	}
}

func listNotesHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		list, err := service.ListDailyNotes(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*DailyNote{}
		}
		c.JSON(http.StatusOK, gin.H{"notes": list})
	}
}
