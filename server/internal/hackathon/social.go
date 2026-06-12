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

// SocialPost is a hacker's submitted social media post, pending verification
// for a sats reward.
type SocialPost struct {
	ID          string     `json:"id"`
	HackathonID string     `json:"hackathon_id"`
	UserID      string     `json:"user_id"`
	UserName    string     `json:"user_name,omitempty"`
	Platform    string     `json:"platform"`
	URL         string     `json:"url"`
	Status      string     `json:"status"`
	RewardSats  int64      `json:"reward_sats"`
	SubmittedAt time.Time  `json:"submitted_at"`
	ReviewedAt  *time.Time `json:"reviewed_at,omitempty"`
}

// SocialPostInput is the request body for POST /hackathons/:id/social-posts.
type SocialPostInput struct {
	Platform string `json:"platform"`
	URL      string `json:"url" binding:"required"`
}

// SubmitSocialPost records a hacker's social media post for verification.
// The reward amount is locked in from the hackathon's current
// social_post_reward_sats at submission time.
func (s *Service) SubmitSocialPost(ctx context.Context, userID, hackathonID string, input SocialPostInput) (*SocialPost, error) {
	if err := s.requireAcceptedApplicant(ctx, userID, hackathonID); err != nil {
		return nil, err
	}

	var rewardSats int64
	if err := s.db.QueryRow(ctx, `SELECT social_post_reward_sats FROM hackathons WHERE id = $1`, hackathonID).Scan(&rewardSats); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}

	var p SocialPost
	err := s.db.QueryRow(ctx, `
		INSERT INTO hackathon_social_posts (hackathon_id, user_id, platform, url, reward_sats)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, hackathon_id, user_id, platform, url, status, reward_sats, submitted_at, reviewed_at
	`, hackathonID, userID, input.Platform, input.URL, rewardSats).Scan(
		&p.ID, &p.HackathonID, &p.UserID, &p.Platform, &p.URL, &p.Status, &p.RewardSats, &p.SubmittedAt, &p.ReviewedAt,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// ListSocialPosts returns every social post submission for a hackathon
// (organizer), or just the requester's own otherwise.
func (s *Service) ListSocialPosts(ctx context.Context, userID, hackathonID string) ([]*SocialPost, error) {
	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT p.id, p.hackathon_id, p.user_id, u.name, p.platform, p.url, p.status, p.reward_sats, p.submitted_at, p.reviewed_at
		FROM hackathon_social_posts p
		JOIN users u ON u.id = p.user_id
		WHERE p.hackathon_id = $1
	`
	args := []any{hackathonID}
	if !isOrg {
		query += ` AND p.user_id = $2`
		args = append(args, userID)
	}
	query += ` ORDER BY p.submitted_at ASC`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*SocialPost
	for rows.Next() {
		var p SocialPost
		if err := rows.Scan(&p.ID, &p.HackathonID, &p.UserID, &p.UserName, &p.Platform, &p.URL, &p.Status, &p.RewardSats, &p.SubmittedAt, &p.ReviewedAt); err != nil {
			return nil, err
		}
		result = append(result, &p)
	}
	return result, rows.Err()
}

// ReviewSocialPost approves or rejects a social post submission. Only the
// organizer may do this. Approving credits the locked-in reward_sats to the
// submitter, once.
func (s *Service) ReviewSocialPost(ctx context.Context, userID, hackathonID, postID string, input SubmissionReviewInput) (*SocialPost, error) {
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

	var p SocialPost
	err = dbTx.QueryRow(ctx, `
		UPDATE hackathon_social_posts
		SET status = $1, reviewed_at = NOW()
		WHERE id = $2 AND hackathon_id = $3 AND status = 'pending'
		RETURNING id, hackathon_id, user_id, platform, url, status, reward_sats, submitted_at, reviewed_at
	`, input.Status, postID, hackathonID).Scan(
		&p.ID, &p.HackathonID, &p.UserID, &p.Platform, &p.URL, &p.Status, &p.RewardSats, &p.SubmittedAt, &p.ReviewedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("post not found or already reviewed")
		}
		return nil, err
	}

	if input.Status == SubmissionApproved && p.RewardSats > 0 {
		if err := s.creditSats(ctx, dbTx, hackathonID, p.UserID, "social_post", p.ID, p.RewardSats); err != nil {
			return nil, err
		}
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}
	return &p, nil
}

// RegisterSocialRoutes wires social-post endpoints onto the given router group.
func RegisterSocialRoutes(api gin.IRouter, service *Service) {
	api.POST("/hackathons/:id/social-posts", submitSocialPostHandler(service))
	api.GET("/hackathons/:id/social-posts", listSocialPostsHandler(service))
	api.PUT("/hackathons/:id/social-posts/:postID", reviewSocialPostHandler(service))
}

func submitSocialPostHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input SocialPostInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "url is required"})
			return
		}
		p, err := service.SubmitSocialPost(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"post": p, "message": "Post submitted for review. 📣"})
	}
}

func listSocialPostsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		list, err := service.ListSocialPosts(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*SocialPost{}
		}
		c.JSON(http.StatusOK, gin.H{"posts": list})
	}
}

func reviewSocialPostHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		postID := c.Param("postID")
		var input SubmissionReviewInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
			return
		}
		p, err := service.ReviewSocialPost(c.Request.Context(), userID, id, postID, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		msg := "Post rejected."
		if p.Status == SubmissionApproved {
			msg = "Post approved and reward credited. 🎉"
		}
		c.JSON(http.StatusOK, gin.H{"post": p, "message": msg})
	}
}
