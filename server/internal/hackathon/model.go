package hackathon

import "time"

// Hackathon status values.
const (
	StatusDraft      = "draft"
	StatusOpen       = "open"
	StatusInProgress = "in_progress"
	StatusJudging    = "judging"
	StatusCompleted  = "completed"
)

// Application status values.
const (
	ApplicationPending    = "pending"
	ApplicationAccepted   = "accepted"
	ApplicationRejected   = "rejected"
	ApplicationWaitlisted = "waitlisted"
)

// Team member roles.
const (
	RoleLeader = "leader"
	RoleMember = "member"
)

// Submission status values, shared by homework submissions and social posts.
const (
	SubmissionPending  = "pending"
	SubmissionApproved = "approved"
	SubmissionRejected = "rejected"
)

// Hackathon is an event organized on the platform.
type Hackathon struct {
	ID                  string     `json:"id"`
	OrganizerID         string     `json:"organizer_id"`
	OrganizerName       string     `json:"organizer_name,omitempty"`
	Name                string     `json:"name"`
	Description         string     `json:"description"`
	Theme               string     `json:"theme"`
	Status              string     `json:"status"`
	ApplicationDeadline *time.Time `json:"application_deadline,omitempty"`
	StartDate           *time.Time `json:"start_date,omitempty"`
	EndDate             *time.Time `json:"end_date,omitempty"`
	MinTeamSize          int        `json:"min_team_size"`
	MaxTeamSize          int        `json:"max_team_size"`
	SocialPostRewardSats int64      `json:"social_post_reward_sats"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`

	// Context for the requesting user, populated on GET /hackathons/:id
	IsOrganizer     bool    `json:"is_organizer,omitempty"`
	MyApplication   *string `json:"my_application_status,omitempty"`
	MyTeamID        *string `json:"my_team_id,omitempty"`
}

// Application is a hacker's application to join a hackathon.
type Application struct {
	ID          string     `json:"id"`
	HackathonID string     `json:"hackathon_id"`
	UserID      string     `json:"user_id"`
	UserName    string     `json:"user_name,omitempty"`
	Status      string     `json:"status"`
	Motivation  string     `json:"motivation"`
	Skills      string     `json:"skills"`
	AppliedAt   time.Time  `json:"applied_at"`
	ReviewedAt  *time.Time `json:"reviewed_at,omitempty"`
}

// TeamMember is a single member of a hackathon team.
type TeamMember struct {
	UserID   string    `json:"user_id"`
	Name     string    `json:"name"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

// Team is a group of hackers participating together in a hackathon.
type Team struct {
	ID          string       `json:"id"`
	HackathonID string       `json:"hackathon_id"`
	Name        string       `json:"name"`
	CreatedAt   time.Time    `json:"created_at"`
	Members     []TeamMember `json:"members"`
}

// CreateInput is the request body for POST /hackathons.
type CreateInput struct {
	Name                 string     `json:"name" binding:"required"`
	Description          string     `json:"description"`
	Theme                string     `json:"theme"`
	ApplicationDeadline  *time.Time `json:"application_deadline"`
	StartDate            *time.Time `json:"start_date"`
	EndDate              *time.Time `json:"end_date"`
	MinTeamSize          int        `json:"min_team_size"`
	MaxTeamSize          int        `json:"max_team_size"`
	SocialPostRewardSats int64      `json:"social_post_reward_sats"`
}

// UpdateInput is the request body for PUT /hackathons/:id.
type UpdateInput struct {
	Name                 string     `json:"name" binding:"required"`
	Description          string     `json:"description"`
	Theme                string     `json:"theme"`
	Status               string     `json:"status" binding:"required"`
	ApplicationDeadline  *time.Time `json:"application_deadline"`
	StartDate            *time.Time `json:"start_date"`
	EndDate              *time.Time `json:"end_date"`
	MinTeamSize          int        `json:"min_team_size"`
	MaxTeamSize          int        `json:"max_team_size"`
	SocialPostRewardSats int64      `json:"social_post_reward_sats"`
}

// ApplyInput is the request body for POST /hackathons/:id/apply.
type ApplyInput struct {
	Motivation string `json:"motivation"`
	Skills     string `json:"skills"`
}

// ReviewInput is the request body for PUT /hackathons/:id/applications/:appID.
type ReviewInput struct {
	Status string `json:"status" binding:"required"`
}

// CreateTeamInput is the request body for POST /hackathons/:id/teams.
type CreateTeamInput struct {
	Name string `json:"name" binding:"required"`
}
