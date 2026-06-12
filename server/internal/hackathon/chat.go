package hackathon

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/altradits/altradits/server/internal/auth"
	"github.com/gin-gonic/gin"
)

// ChatMessage is a single message in a hackathon's general room or a team's
// private room.
type ChatMessage struct {
	ID          string    `json:"id"`
	HackathonID string    `json:"hackathon_id"`
	TeamID      *string   `json:"team_id,omitempty"`
	UserID      string    `json:"user_id"`
	UserName    string    `json:"user_name,omitempty"`
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"created_at"`
}

// ChatMessageInput is the request body for POST /hackathons/:id/chat.
type ChatMessageInput struct {
	Body   string  `json:"body" binding:"required"`
	TeamID *string `json:"team_id"`
}

// isTeamMember reports whether userID belongs to teamID within hackathonID.
func (s *Service) isTeamMember(ctx context.Context, userID, hackathonID, teamID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM hackathon_team_members WHERE hackathon_id = $1 AND team_id = $2 AND user_id = $3)
	`, hackathonID, teamID, userID).Scan(&exists)
	return exists, err
}

// requireChatAccess returns an error unless userID may read/write the given
// room: team rooms require team membership (or the organizer), the general
// room requires participant status.
func (s *Service) requireChatAccess(ctx context.Context, userID, hackathonID string, teamID *string) error {
	if teamID == nil || *teamID == "" {
		return s.requireParticipant(ctx, userID, hackathonID)
	}

	member, err := s.isTeamMember(ctx, userID, hackathonID, *teamID)
	if err != nil {
		return err
	}
	if member {
		return nil
	}
	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return err
	}
	if !isOrg {
		return ErrNotTeamMember
	}
	return nil
}

// PostChatMessage adds a message to the general room (team_id == nil) or a
// team room.
func (s *Service) PostChatMessage(ctx context.Context, userID, hackathonID string, input ChatMessageInput) (*ChatMessage, error) {
	body := strings.TrimSpace(input.Body)
	if body == "" {
		return nil, fmt.Errorf("message cannot be empty")
	}

	if err := s.requireChatAccess(ctx, userID, hackathonID, input.TeamID); err != nil {
		return nil, err
	}

	var m ChatMessage
	err := s.db.QueryRow(ctx, `
		INSERT INTO hackathon_chat_messages (hackathon_id, team_id, user_id, body)
		VALUES ($1, $2, $3, $4)
		RETURNING id, hackathon_id, team_id, user_id, body, created_at
	`, hackathonID, input.TeamID, userID, body).Scan(&m.ID, &m.HackathonID, &m.TeamID, &m.UserID, &m.Body, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	_ = s.db.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, userID).Scan(&m.UserName)
	return &m, nil
}

// ListChatMessages returns messages for the general room (teamID == "") or a
// team room, oldest first. If since is non-zero, only messages after that
// time are returned.
func (s *Service) ListChatMessages(ctx context.Context, userID, hackathonID, teamID string, since time.Time) ([]*ChatMessage, error) {
	var teamFilter *string
	if teamID != "" {
		teamFilter = &teamID
	}
	if err := s.requireChatAccess(ctx, userID, hackathonID, teamFilter); err != nil {
		return nil, err
	}

	query := `
		SELECT m.id, m.hackathon_id, m.team_id, m.user_id, u.name, m.body, m.created_at
		FROM hackathon_chat_messages m
		JOIN users u ON u.id = m.user_id
		WHERE m.hackathon_id = $1
	`
	args := []any{hackathonID}
	if teamID != "" {
		args = append(args, teamID)
		query += fmt.Sprintf(" AND m.team_id = $%d", len(args))
	} else {
		query += " AND m.team_id IS NULL"
	}
	if !since.IsZero() {
		args = append(args, since)
		query += fmt.Sprintf(" AND m.created_at > $%d", len(args))
	}
	query += " ORDER BY m.created_at ASC"

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*ChatMessage
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.HackathonID, &m.TeamID, &m.UserID, &m.UserName, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, &m)
	}
	return result, rows.Err()
}

// RegisterChatRoutes wires live-chat endpoints onto the given router group.
func RegisterChatRoutes(api gin.IRouter, service *Service) {
	api.POST("/hackathons/:id/chat", postChatHandler(service))
	api.GET("/hackathons/:id/chat", listChatHandler(service))
}

func postChatHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input ChatMessageInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "body is required"})
			return
		}
		m, err := service.PostChatMessage(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"chat_message": m})
	}
}

func listChatHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		teamID := c.Query("team_id")

		var since time.Time
		if raw := c.Query("since"); raw != "" {
			if parsed, err := time.Parse(time.RFC3339Nano, raw); err == nil {
				since = parsed
			}
		}

		list, err := service.ListChatMessages(c.Request.Context(), userID, id, teamID, since)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*ChatMessage{}
		}
		c.JSON(http.StatusOK, gin.H{"messages": list})
	}
}
