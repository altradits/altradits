package hackathon

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/altradits/altradits/server/internal/auth"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// Homework is a daily assignment hackers can submit work for, optionally
// rewarded in sats once approved.
type Homework struct {
	ID          string    `json:"id"`
	HackathonID string    `json:"hackathon_id"`
	DayNumber   int       `json:"day_number"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	RewardSats  int64     `json:"reward_sats"`
	CreatedAt   time.Time `json:"created_at"`

	// MySubmissionStatus is populated for hackers: their own submission
	// status for this homework, if any.
	MySubmissionStatus *string `json:"my_submission_status,omitempty"`
}

// HomeworkInput is the request body for POST /hackathons/:id/homework.
type HomeworkInput struct {
	DayNumber   int    `json:"day_number" binding:"required"`
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	RewardSats  int64  `json:"reward_sats"`
}

// HomeworkSubmission is a hacker's submission for a homework assignment.
type HomeworkSubmission struct {
	ID          string     `json:"id"`
	HomeworkID  string     `json:"homework_id"`
	HackathonID string     `json:"hackathon_id"`
	UserID      string     `json:"user_id"`
	UserName    string     `json:"user_name,omitempty"`
	Content     string     `json:"content"`
	Status      string     `json:"status"`
	SubmittedAt time.Time  `json:"submitted_at"`
	ReviewedAt  *time.Time `json:"reviewed_at,omitempty"`
}

// SubmissionInput is the request body for POST .../homework/:hwID/submit.
type SubmissionInput struct {
	Content string `json:"content" binding:"required"`
}

// SubmissionReviewInput is the request body for PUT .../submissions/:subID
// and PUT .../social-posts/:postID.
type SubmissionReviewInput struct {
	Status string `json:"status" binding:"required"`
}

// CreateHomework adds a new homework assignment for a hackathon. Organizer only.
func (s *Service) CreateHomework(ctx context.Context, userID, hackathonID string, input HomeworkInput) (*Homework, error) {
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
	if input.RewardSats < 0 {
		return nil, fmt.Errorf("reward_sats cannot be negative")
	}

	var h Homework
	err = s.db.QueryRow(ctx, `
		INSERT INTO hackathon_homework (hackathon_id, day_number, title, description, reward_sats)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, hackathon_id, day_number, title, description, reward_sats, created_at
	`, hackathonID, input.DayNumber, input.Title, input.Description, input.RewardSats).Scan(
		&h.ID, &h.HackathonID, &h.DayNumber, &h.Title, &h.Description, &h.RewardSats, &h.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &h, nil
}

// ListHomework returns every homework assignment for a hackathon. For
// hackers, each entry is annotated with their own submission status.
func (s *Service) ListHomework(ctx context.Context, userID, hackathonID string) ([]*Homework, error) {
	if err := s.requireParticipant(ctx, userID, hackathonID); err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT h.id, h.hackathon_id, h.day_number, h.title, h.description, h.reward_sats, h.created_at, s.status
		FROM hackathon_homework h
		LEFT JOIN hackathon_homework_submissions s ON s.homework_id = h.id AND s.user_id = $2
		WHERE h.hackathon_id = $1
		ORDER BY h.day_number ASC
	`, hackathonID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Homework
	for rows.Next() {
		var h Homework
		var status *string
		if err := rows.Scan(&h.ID, &h.HackathonID, &h.DayNumber, &h.Title, &h.Description, &h.RewardSats, &h.CreatedAt, &status); err != nil {
			return nil, err
		}
		h.MySubmissionStatus = status
		result = append(result, &h)
	}
	return result, rows.Err()
}

// SubmitHomework records or replaces a hacker's submission for a homework
// assignment. Only accepted hackers may submit, and a submission that has
// already been reviewed cannot be changed.
func (s *Service) SubmitHomework(ctx context.Context, userID, hackathonID, homeworkID string, input SubmissionInput) (*HomeworkSubmission, error) {
	if err := s.requireAcceptedApplicant(ctx, userID, hackathonID); err != nil {
		return nil, err
	}

	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT true FROM hackathon_homework WHERE id = $1 AND hackathon_id = $2`, homeworkID, hackathonID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHomeworkNotFound
		}
		return nil, err
	}

	var sub HomeworkSubmission
	err := s.db.QueryRow(ctx, `
		INSERT INTO hackathon_homework_submissions (homework_id, hackathon_id, user_id, content)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (homework_id, user_id) DO UPDATE
		SET content = $4, submitted_at = NOW()
		WHERE hackathon_homework_submissions.status = 'pending'
		RETURNING id, homework_id, hackathon_id, user_id, content, status, submitted_at, reviewed_at
	`, homeworkID, hackathonID, userID, input.Content).Scan(
		&sub.ID, &sub.HomeworkID, &sub.HackathonID, &sub.UserID, &sub.Content, &sub.Status, &sub.SubmittedAt, &sub.ReviewedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("this submission has already been reviewed and cannot be changed")
		}
		return nil, err
	}
	return &sub, nil
}

// ListSubmissions returns every submission for a homework assignment
// (organizer), or just the requester's own submission otherwise.
func (s *Service) ListSubmissions(ctx context.Context, userID, hackathonID, homeworkID string) ([]*HomeworkSubmission, error) {
	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT s.id, s.homework_id, s.hackathon_id, s.user_id, u.name, s.content, s.status, s.submitted_at, s.reviewed_at
		FROM hackathon_homework_submissions s
		JOIN users u ON u.id = s.user_id
		WHERE s.homework_id = $1 AND s.hackathon_id = $2
	`
	args := []any{homeworkID, hackathonID}
	if !isOrg {
		query += ` AND s.user_id = $3`
		args = append(args, userID)
	}
	query += ` ORDER BY s.submitted_at ASC`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*HomeworkSubmission
	for rows.Next() {
		var sub HomeworkSubmission
		if err := rows.Scan(&sub.ID, &sub.HomeworkID, &sub.HackathonID, &sub.UserID, &sub.UserName, &sub.Content, &sub.Status, &sub.SubmittedAt, &sub.ReviewedAt); err != nil {
			return nil, err
		}
		result = append(result, &sub)
	}
	return result, rows.Err()
}

// ReviewSubmission approves or rejects a homework submission. Only the
// organizer may do this. Approving credits the homework's reward_sats to the
// submitter, once.
func (s *Service) ReviewSubmission(ctx context.Context, userID, hackathonID, homeworkID, subID string, input SubmissionReviewInput) (*HomeworkSubmission, error) {
	if input.Status != SubmissionApproved && input.Status != SubmissionRejected {
		return nil, fmt.Errorf("status must be approved or rejected")
	}

	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return nil, err
	}
	if !isOrg {
		return nil, ErrNotOrganizer
	}

	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	var sub HomeworkSubmission
	var rewardSats int64
	err = dbTx.QueryRow(ctx, `
		UPDATE hackathon_homework_submissions s
		SET status = $1, reviewed_at = NOW()
		FROM hackathon_homework h
		WHERE s.id = $2 AND s.homework_id = $3 AND s.hackathon_id = $4
		  AND h.id = s.homework_id AND s.status = 'pending'
		RETURNING s.id, s.homework_id, s.hackathon_id, s.user_id, s.content, s.status, s.submitted_at, s.reviewed_at, h.reward_sats
	`, input.Status, subID, homeworkID, hackathonID).Scan(
		&sub.ID, &sub.HomeworkID, &sub.HackathonID, &sub.UserID, &sub.Content, &sub.Status, &sub.SubmittedAt, &sub.ReviewedAt, &rewardSats,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("submission not found or already reviewed")
		}
		return nil, err
	}

	if input.Status == SubmissionApproved && rewardSats > 0 {
		if err := s.creditSats(ctx, dbTx, hackathonID, sub.UserID, "homework", sub.ID, rewardSats); err != nil {
			return nil, err
		}
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	return &sub, nil
}

// RegisterHomeworkRoutes wires homework endpoints onto the given router group.
func RegisterHomeworkRoutes(api gin.IRouter, service *Service) {
	api.POST("/hackathons/:id/homework", createHomeworkHandler(service))
	api.GET("/hackathons/:id/homework", listHomeworkHandler(service))
	api.POST("/hackathons/:id/homework/:hwID/submit", submitHomeworkHandler(service))
	api.GET("/hackathons/:id/homework/:hwID/submissions", listSubmissionsHandler(service))
	api.PUT("/hackathons/:id/homework/:hwID/submissions/:subID", reviewSubmissionHandler(service))
}

func createHomeworkHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input HomeworkInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "day_number and title are required"})
			return
		}
		h, err := service.CreateHomework(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"homework": h, "message": fmt.Sprintf("Day %d homework posted.", h.DayNumber)})
	}
}

func listHomeworkHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		list, err := service.ListHomework(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*Homework{}
		}
		c.JSON(http.StatusOK, gin.H{"homework": list})
	}
}

func submitHomeworkHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		hwID := c.Param("hwID")
		var input SubmissionInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "content is required"})
			return
		}
		sub, err := service.SubmitHomework(c.Request.Context(), userID, id, hwID, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"submission": sub, "message": "Submission received."})
	}
}

func listSubmissionsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		hwID := c.Param("hwID")
		list, err := service.ListSubmissions(c.Request.Context(), userID, id, hwID)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*HomeworkSubmission{}
		}
		c.JSON(http.StatusOK, gin.H{"submissions": list})
	}
}

func reviewSubmissionHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		hwID := c.Param("hwID")
		subID := c.Param("subID")
		var input SubmissionReviewInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
			return
		}
		sub, err := service.ReviewSubmission(c.Request.Context(), userID, id, hwID, subID, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		msg := "Submission rejected."
		if sub.Status == SubmissionApproved {
			msg = "Submission approved and reward credited. 🎉"
		}
		c.JSON(http.StatusOK, gin.H{"submission": sub, "message": msg})
	}
}
