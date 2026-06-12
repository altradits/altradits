package hackathon

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Sentinel errors mapped to specific HTTP status codes by the handler.
var (
	ErrHackathonNotFound  = errors.New("hackathon not found")
	ErrNotOrganizer       = errors.New("only the organizer can do this")
	ErrAlreadyApplied     = errors.New("you have already applied to this hackathon")
	ErrApplicationsClosed = errors.New("applications are not currently open for this hackathon")
	ErrNotAccepted        = errors.New("you must be an accepted hacker to join or create a team")
	ErrAlreadyOnTeam      = errors.New("you are already on a team for this hackathon")
	ErrTeamNotFound       = errors.New("team not found")
	ErrTeamFull           = errors.New("this team is full")
	ErrNotParticipant     = errors.New("you must be an accepted hacker or the organizer to access this")
	ErrNotTeamMember      = errors.New("you must be a member of this team")
	ErrInvalidCheckinCode = errors.New("invalid or expired check-in code")
	ErrHomeworkNotFound   = errors.New("homework not found")
)

var validStatuses = map[string]bool{
	StatusDraft:      true,
	StatusOpen:       true,
	StatusInProgress: true,
	StatusJudging:    true,
	StatusCompleted:  true,
}

var validApplicationDecisions = map[string]bool{
	ApplicationAccepted:   true,
	ApplicationRejected:   true,
	ApplicationWaitlisted: true,
}

// Service implements hackathon creation, hacker applications, and team
// formation on top of the hackathons / hackathon_applications /
// hackathon_teams / hackathon_team_members tables.
type Service struct {
	db *pgxpool.Pool
}

// NewService creates the hackathon service.
func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

const hackathonReturning = `
	id, organizer_id, name, description, theme, status,
	application_deadline, start_date, end_date,
	min_team_size, max_team_size, social_post_reward_sats, created_at, updated_at
`

func scanHackathon(row pgx.Row, h *Hackathon) error {
	return row.Scan(
		&h.ID, &h.OrganizerID, &h.Name, &h.Description, &h.Theme, &h.Status,
		&h.ApplicationDeadline, &h.StartDate, &h.EndDate,
		&h.MinTeamSize, &h.MaxTeamSize, &h.SocialPostRewardSats, &h.CreatedAt, &h.UpdatedAt,
	)
}

func normalizeTeamSizes(minSize, maxSize int) (int, int, error) {
	if minSize == 0 {
		minSize = 2
	}
	if maxSize == 0 {
		maxSize = 5
	}
	if minSize < 1 || maxSize < minSize {
		return 0, 0, fmt.Errorf("min_team_size must be at least 1, and max_team_size must be greater than or equal to min_team_size")
	}
	return minSize, maxSize, nil
}

// Create adds a new hackathon, organized by userID.
func (s *Service) Create(ctx context.Context, userID string, input CreateInput) (*Hackathon, error) {
	minSize, maxSize, err := normalizeTeamSizes(input.MinTeamSize, input.MaxTeamSize)
	if err != nil {
		return nil, err
	}

	var h Hackathon
	err = scanHackathon(s.db.QueryRow(ctx, `
		INSERT INTO hackathons (organizer_id, name, description, theme, application_deadline, start_date, end_date, min_team_size, max_team_size, social_post_reward_sats)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+hackathonReturning,
		userID, input.Name, input.Description, input.Theme, input.ApplicationDeadline, input.StartDate, input.EndDate, minSize, maxSize, input.SocialPostRewardSats,
	), &h)
	if err != nil {
		return nil, fmt.Errorf("failed to create hackathon: %w", err)
	}
	return &h, nil
}

// List returns hackathons visible to userID: every non-draft hackathon, plus
// any drafts the user is organizing.
func (s *Service) List(ctx context.Context, userID string) ([]*Hackathon, error) {
	rows, err := s.db.Query(ctx, `
		SELECT h.id, h.organizer_id, u.name, h.name, h.description, h.theme, h.status,
		       h.application_deadline, h.start_date, h.end_date,
		       h.min_team_size, h.max_team_size, h.social_post_reward_sats, h.created_at, h.updated_at
		FROM hackathons h
		JOIN users u ON u.id = h.organizer_id
		WHERE h.status != 'draft' OR h.organizer_id = $1
		ORDER BY h.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Hackathon
	for rows.Next() {
		var h Hackathon
		if err := rows.Scan(
			&h.ID, &h.OrganizerID, &h.OrganizerName, &h.Name, &h.Description, &h.Theme, &h.Status,
			&h.ApplicationDeadline, &h.StartDate, &h.EndDate,
			&h.MinTeamSize, &h.MaxTeamSize, &h.SocialPostRewardSats, &h.CreatedAt, &h.UpdatedAt,
		); err != nil {
			return nil, err
		}
		h.IsOrganizer = h.OrganizerID == userID
		result = append(result, &h)
	}
	return result, rows.Err()
}

// Get returns a single hackathon, enriched with the requesting user's
// relationship to it (organizer, application status, team membership).
func (s *Service) Get(ctx context.Context, userID, id string) (*Hackathon, error) {
	var h Hackathon
	err := s.db.QueryRow(ctx, `
		SELECT h.id, h.organizer_id, u.name, h.name, h.description, h.theme, h.status,
		       h.application_deadline, h.start_date, h.end_date,
		       h.min_team_size, h.max_team_size, h.social_post_reward_sats, h.created_at, h.updated_at
		FROM hackathons h
		JOIN users u ON u.id = h.organizer_id
		WHERE h.id = $1
	`, id).Scan(
		&h.ID, &h.OrganizerID, &h.OrganizerName, &h.Name, &h.Description, &h.Theme, &h.Status,
		&h.ApplicationDeadline, &h.StartDate, &h.EndDate,
		&h.MinTeamSize, &h.MaxTeamSize, &h.SocialPostRewardSats, &h.CreatedAt, &h.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}

	h.IsOrganizer = h.OrganizerID == userID

	var appStatus string
	err = s.db.QueryRow(ctx, `SELECT status FROM hackathon_applications WHERE hackathon_id = $1 AND user_id = $2`, id, userID).Scan(&appStatus)
	switch {
	case err == nil:
		h.MyApplication = &appStatus
	case errors.Is(err, pgx.ErrNoRows):
		// no application — leave nil
	default:
		return nil, err
	}

	var teamID string
	err = s.db.QueryRow(ctx, `SELECT team_id FROM hackathon_team_members WHERE hackathon_id = $1 AND user_id = $2`, id, userID).Scan(&teamID)
	switch {
	case err == nil:
		h.MyTeamID = &teamID
	case errors.Is(err, pgx.ErrNoRows):
		// not on a team — leave nil
	default:
		return nil, err
	}

	return &h, nil
}

// Update replaces a hackathon's editable fields. Only the organizer may do this.
func (s *Service) Update(ctx context.Context, userID, id string, input UpdateInput) (*Hackathon, error) {
	if !validStatuses[input.Status] {
		return nil, fmt.Errorf("status must be one of draft, open, in_progress, judging, completed")
	}
	minSize, maxSize, err := normalizeTeamSizes(input.MinTeamSize, input.MaxTeamSize)
	if err != nil {
		return nil, err
	}

	var h Hackathon
	err = scanHackathon(s.db.QueryRow(ctx, `
		UPDATE hackathons
		SET name = $1, description = $2, theme = $3, status = $4,
		    application_deadline = $5, start_date = $6, end_date = $7,
		    min_team_size = $8, max_team_size = $9, social_post_reward_sats = $10, updated_at = NOW()
		WHERE id = $11 AND organizer_id = $12
		RETURNING `+hackathonReturning,
		input.Name, input.Description, input.Theme, input.Status,
		input.ApplicationDeadline, input.StartDate, input.EndDate,
		minSize, maxSize, input.SocialPostRewardSats, id, userID,
	), &h)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			var exists bool
			checkErr := s.db.QueryRow(ctx, `SELECT true FROM hackathons WHERE id = $1`, id).Scan(&exists)
			if checkErr == nil && exists {
				return nil, ErrNotOrganizer
			}
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}
	return &h, nil
}

// Apply submits a hacker's application to join a hackathon.
func (s *Service) Apply(ctx context.Context, userID, hackathonID string, input ApplyInput) (*Application, error) {
	var organizerID, status string
	err := s.db.QueryRow(ctx, `SELECT organizer_id, status FROM hackathons WHERE id = $1`, hackathonID).Scan(&organizerID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}
	if organizerID == userID {
		return nil, fmt.Errorf("organizers cannot apply to their own hackathon")
	}
	if status != StatusOpen {
		return nil, ErrApplicationsClosed
	}

	var a Application
	err = s.db.QueryRow(ctx, `
		INSERT INTO hackathon_applications (hackathon_id, user_id, motivation, skills)
		VALUES ($1, $2, $3, $4)
		RETURNING id, hackathon_id, user_id, status, motivation, skills, applied_at, reviewed_at
	`, hackathonID, userID, input.Motivation, input.Skills).Scan(
		&a.ID, &a.HackathonID, &a.UserID, &a.Status, &a.Motivation, &a.Skills, &a.AppliedAt, &a.ReviewedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrAlreadyApplied
		}
		return nil, err
	}
	return &a, nil
}

// ListApplications returns every application for organizers, or just the
// requesting user's own application otherwise.
func (s *Service) ListApplications(ctx context.Context, userID, hackathonID string) ([]*Application, error) {
	var organizerID string
	err := s.db.QueryRow(ctx, `SELECT organizer_id FROM hackathons WHERE id = $1`, hackathonID).Scan(&organizerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}

	query := `
		SELECT a.id, a.hackathon_id, a.user_id, u.name, a.status, a.motivation, a.skills, a.applied_at, a.reviewed_at
		FROM hackathon_applications a
		JOIN users u ON u.id = a.user_id
		WHERE a.hackathon_id = $1
	`
	args := []any{hackathonID}
	if organizerID != userID {
		query += ` AND a.user_id = $2`
		args = append(args, userID)
	}
	query += ` ORDER BY a.applied_at ASC`

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []*Application
	for rows.Next() {
		var a Application
		if err := rows.Scan(&a.ID, &a.HackathonID, &a.UserID, &a.UserName, &a.Status, &a.Motivation, &a.Skills, &a.AppliedAt, &a.ReviewedAt); err != nil {
			return nil, err
		}
		result = append(result, &a)
	}
	return result, rows.Err()
}

// ReviewApplication accepts, rejects, or waitlists a hacker's application.
// Only the organizer may do this.
func (s *Service) ReviewApplication(ctx context.Context, userID, hackathonID, appID string, input ReviewInput) (*Application, error) {
	if !validApplicationDecisions[input.Status] {
		return nil, fmt.Errorf("status must be accepted, rejected, or waitlisted")
	}

	var organizerID string
	err := s.db.QueryRow(ctx, `SELECT organizer_id FROM hackathons WHERE id = $1`, hackathonID).Scan(&organizerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}
	if organizerID != userID {
		return nil, ErrNotOrganizer
	}

	var a Application
	err = s.db.QueryRow(ctx, `
		UPDATE hackathon_applications
		SET status = $1, reviewed_at = NOW()
		WHERE id = $2 AND hackathon_id = $3
		RETURNING id, hackathon_id, user_id, status, motivation, skills, applied_at, reviewed_at
	`, input.Status, appID, hackathonID).Scan(
		&a.ID, &a.HackathonID, &a.UserID, &a.Status, &a.Motivation, &a.Skills, &a.AppliedAt, &a.ReviewedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("application not found")
		}
		return nil, err
	}
	return &a, nil
}

// requireAcceptedApplicant returns ErrNotAccepted unless userID has an
// accepted application for hackathonID.
func (s *Service) requireAcceptedApplicant(ctx context.Context, userID, hackathonID string) error {
	var status string
	err := s.db.QueryRow(ctx, `SELECT status FROM hackathon_applications WHERE hackathon_id = $1 AND user_id = $2`, hackathonID, userID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotAccepted
		}
		return err
	}
	if status != ApplicationAccepted {
		return ErrNotAccepted
	}
	return nil
}

// onTeam reports whether userID is already a member of any team in hackathonID.
func (s *Service) onTeam(ctx context.Context, userID, hackathonID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM hackathon_team_members WHERE hackathon_id = $1 AND user_id = $2)
	`, hackathonID, userID).Scan(&exists)
	return exists, err
}

// isOrganizer reports whether userID organizes hackathonID.
func (s *Service) isOrganizer(ctx context.Context, userID, hackathonID string) (bool, error) {
	var organizerID string
	err := s.db.QueryRow(ctx, `SELECT organizer_id FROM hackathons WHERE id = $1`, hackathonID).Scan(&organizerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, ErrHackathonNotFound
		}
		return false, err
	}
	return organizerID == userID, nil
}

// requireParticipant returns ErrNotParticipant unless userID organizes the
// hackathon or has an accepted application to it.
func (s *Service) requireParticipant(ctx context.Context, userID, hackathonID string) error {
	isOrg, err := s.isOrganizer(ctx, userID, hackathonID)
	if err != nil {
		return err
	}
	if isOrg {
		return nil
	}
	var status string
	err = s.db.QueryRow(ctx, `SELECT status FROM hackathon_applications WHERE hackathon_id = $1 AND user_id = $2`, hackathonID, userID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotParticipant
		}
		return err
	}
	if status != ApplicationAccepted {
		return ErrNotParticipant
	}
	return nil
}

// creditSats adds amountSats to userID's wallet balance and records a
// hackathon_rewards entry for transparency. Must be called within dbTx.
func (s *Service) creditSats(ctx context.Context, dbTx pgx.Tx, hackathonID, userID, source, sourceID string, amountSats int64) error {
	if amountSats <= 0 {
		return nil
	}
	if _, err := dbTx.Exec(ctx, `
		UPDATE users SET current_sats_balance = current_sats_balance + $1, total_sats_received = total_sats_received + $1
		WHERE id = $2
	`, amountSats, userID); err != nil {
		return err
	}
	_, err := dbTx.Exec(ctx, `
		INSERT INTO hackathon_rewards (hackathon_id, user_id, source, source_id, amount_sats)
		VALUES ($1, $2, $3, $4, $5)
	`, hackathonID, userID, source, sourceID, amountSats)
	return err
}

// CreateTeam forms a new team within a hackathon, with the creator as leader.
// The creator must have an accepted application and not already be on a team.
func (s *Service) CreateTeam(ctx context.Context, userID, hackathonID string, input CreateTeamInput) (*Team, error) {
	var hackathonExists bool
	if err := s.db.QueryRow(ctx, `SELECT true FROM hackathons WHERE id = $1`, hackathonID).Scan(&hackathonExists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}

	if err := s.requireAcceptedApplicant(ctx, userID, hackathonID); err != nil {
		return nil, err
	}

	already, err := s.onTeam(ctx, userID, hackathonID)
	if err != nil {
		return nil, err
	}
	if already {
		return nil, ErrAlreadyOnTeam
	}

	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer dbTx.Rollback(ctx)

	var t Team
	err = dbTx.QueryRow(ctx, `
		INSERT INTO hackathon_teams (hackathon_id, name)
		VALUES ($1, $2)
		RETURNING id, hackathon_id, name, created_at
	`, hackathonID, input.Name).Scan(&t.ID, &t.HackathonID, &t.Name, &t.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, fmt.Errorf("a team with that name already exists in this hackathon")
		}
		return nil, err
	}

	var member TeamMember
	err = dbTx.QueryRow(ctx, `
		INSERT INTO hackathon_team_members (team_id, hackathon_id, user_id, role)
		VALUES ($1, $2, $3, $4)
		RETURNING user_id, role, joined_at
	`, t.ID, hackathonID, userID, RoleLeader).Scan(&member.UserID, &member.Role, &member.JoinedAt)
	if err != nil {
		return nil, err
	}

	if err := dbTx.Commit(ctx); err != nil {
		return nil, err
	}

	_ = s.db.QueryRow(ctx, `SELECT name FROM users WHERE id = $1`, userID).Scan(&member.Name)
	t.Members = []TeamMember{member}
	return &t, nil
}

// ListTeams returns every team in a hackathon, with members.
func (s *Service) ListTeams(ctx context.Context, hackathonID string) ([]*Team, error) {
	var exists bool
	if err := s.db.QueryRow(ctx, `SELECT true FROM hackathons WHERE id = $1`, hackathonID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHackathonNotFound
		}
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, hackathon_id, name, created_at
		FROM hackathon_teams
		WHERE hackathon_id = $1
		ORDER BY created_at ASC
	`, hackathonID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teams []*Team
	teamsByID := make(map[string]*Team)
	for rows.Next() {
		var t Team
		if err := rows.Scan(&t.ID, &t.HackathonID, &t.Name, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.Members = []TeamMember{}
		teams = append(teams, &t)
		teamsByID[t.ID] = &t
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	memberRows, err := s.db.Query(ctx, `
		SELECT m.team_id, m.user_id, u.name, m.role, m.joined_at
		FROM hackathon_team_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.hackathon_id = $1
		ORDER BY m.joined_at ASC
	`, hackathonID)
	if err != nil {
		return nil, err
	}
	defer memberRows.Close()

	for memberRows.Next() {
		var teamID string
		var m TeamMember
		if err := memberRows.Scan(&teamID, &m.UserID, &m.Name, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		if t, ok := teamsByID[teamID]; ok {
			t.Members = append(t.Members, m)
		}
	}
	return teams, memberRows.Err()
}

// GetTeam returns a single team with its members.
func (s *Service) GetTeam(ctx context.Context, hackathonID, teamID string) (*Team, error) {
	var t Team
	err := s.db.QueryRow(ctx, `
		SELECT id, hackathon_id, name, created_at
		FROM hackathon_teams
		WHERE id = $1 AND hackathon_id = $2
	`, teamID, hackathonID).Scan(&t.ID, &t.HackathonID, &t.Name, &t.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTeamNotFound
		}
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT m.user_id, u.name, m.role, m.joined_at
		FROM hackathon_team_members m
		JOIN users u ON u.id = m.user_id
		WHERE m.team_id = $1
		ORDER BY m.joined_at ASC
	`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	t.Members = []TeamMember{}
	for rows.Next() {
		var m TeamMember
		if err := rows.Scan(&m.UserID, &m.Name, &m.Role, &m.JoinedAt); err != nil {
			return nil, err
		}
		t.Members = append(t.Members, m)
	}
	return &t, rows.Err()
}

// JoinTeam adds an accepted hacker to a team, as long as it isn't full and
// they aren't already on a team in this hackathon.
func (s *Service) JoinTeam(ctx context.Context, userID, hackathonID, teamID string) error {
	var maxTeamSize int
	if err := s.db.QueryRow(ctx, `SELECT max_team_size FROM hackathons WHERE id = $1`, hackathonID).Scan(&maxTeamSize); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrHackathonNotFound
		}
		return err
	}

	if err := s.requireAcceptedApplicant(ctx, userID, hackathonID); err != nil {
		return err
	}

	already, err := s.onTeam(ctx, userID, hackathonID)
	if err != nil {
		return err
	}
	if already {
		return ErrAlreadyOnTeam
	}

	var teamExists bool
	var memberCount int
	err = s.db.QueryRow(ctx, `
		SELECT true, COUNT(m.id)
		FROM hackathon_teams t
		LEFT JOIN hackathon_team_members m ON m.team_id = t.id
		WHERE t.id = $1 AND t.hackathon_id = $2
		GROUP BY t.id
	`, teamID, hackathonID).Scan(&teamExists, &memberCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrTeamNotFound
		}
		return err
	}
	if memberCount >= maxTeamSize {
		return ErrTeamFull
	}

	_, err = s.db.Exec(ctx, `
		INSERT INTO hackathon_team_members (team_id, hackathon_id, user_id, role)
		VALUES ($1, $2, $3, $4)
	`, teamID, hackathonID, userID, RoleMember)
	return err
}

// LeaveTeam removes userID from a team. If the leaving member was the leader
// and teammates remain, the longest-standing remaining member is promoted to
// leader. If the team becomes empty, it is deleted.
func (s *Service) LeaveTeam(ctx context.Context, userID, hackathonID, teamID string) error {
	dbTx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer dbTx.Rollback(ctx)

	var role string
	err = dbTx.QueryRow(ctx, `
		DELETE FROM hackathon_team_members
		WHERE team_id = $1 AND hackathon_id = $2 AND user_id = $3
		RETURNING role
	`, teamID, hackathonID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("you are not a member of this team")
		}
		return err
	}

	var remaining int
	if err := dbTx.QueryRow(ctx, `SELECT COUNT(*) FROM hackathon_team_members WHERE team_id = $1`, teamID).Scan(&remaining); err != nil {
		return err
	}

	switch {
	case remaining == 0:
		if _, err := dbTx.Exec(ctx, `DELETE FROM hackathon_teams WHERE id = $1`, teamID); err != nil {
			return err
		}
	case role == RoleLeader:
		if _, err := dbTx.Exec(ctx, `
			UPDATE hackathon_team_members
			SET role = $1
			WHERE id = (
				SELECT id FROM hackathon_team_members WHERE team_id = $2 ORDER BY joined_at ASC LIMIT 1
			)
		`, RoleLeader, teamID); err != nil {
			return err
		}
	}

	return dbTx.Commit(ctx)
}
