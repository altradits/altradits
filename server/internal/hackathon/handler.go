package hackathon

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/altradits/altradits/server/internal/auth"
	"github.com/gin-gonic/gin"
)

// RegisterRoutes wires hackathon endpoints onto the given router group. The
// group should already have auth middleware applied.
func RegisterRoutes(api gin.IRouter, service *Service) {
	api.POST("/hackathons", createHandler(service))
	api.GET("/hackathons", listHandler(service))
	api.GET("/hackathons/:id", getHandler(service))
	api.PUT("/hackathons/:id", updateHandler(service))
	api.POST("/hackathons/:id/apply", applyHandler(service))
	api.GET("/hackathons/:id/applications", listApplicationsHandler(service))
	api.PUT("/hackathons/:id/applications/:appID", reviewApplicationHandler(service))
	api.POST("/hackathons/:id/teams", createTeamHandler(service))
	api.GET("/hackathons/:id/teams", listTeamsHandler(service))
	api.GET("/hackathons/:id/teams/:teamID", getTeamHandler(service))
	api.POST("/hackathons/:id/teams/:teamID/join", joinTeamHandler(service))
	api.POST("/hackathons/:id/teams/:teamID/leave", leaveTeamHandler(service))
}

// statusForError maps service sentinel errors to HTTP status codes.
func statusForError(err error) int {
	switch {
	case errors.Is(err, ErrHackathonNotFound), errors.Is(err, ErrTeamNotFound), errors.Is(err, ErrHomeworkNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrNotOrganizer), errors.Is(err, ErrNotParticipant), errors.Is(err, ErrNotTeamMember):
		return http.StatusForbidden
	default:
		return http.StatusBadRequest
	}
}

func createHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input CreateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		h, err := service.Create(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"hackathon": h,
			"message":   fmt.Sprintf("%s created. Time to build something great. 🚀", h.Name),
		})
	}
}

func listHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		list, err := service.List(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load hackathons"})
			return
		}
		if list == nil {
			list = []*Hackathon{}
		}
		c.JSON(http.StatusOK, gin.H{"hackathons": list})
	}
}

func getHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		h, err := service.Get(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, h)
	}
}

func updateHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input UpdateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name and status are required"})
			return
		}
		h, err := service.Update(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"hackathon": h, "message": "Hackathon updated."})
	}
}

func applyHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input ApplyInput
		_ = c.ShouldBindJSON(&input)
		a, err := service.Apply(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"application": a,
			"message":     "Application submitted. We'll let you know once it's reviewed. 🌱",
		})
	}
}

func listApplicationsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		list, err := service.ListApplications(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*Application{}
		}
		c.JSON(http.StatusOK, gin.H{"applications": list})
	}
}

func reviewApplicationHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		appID := c.Param("appID")
		var input ReviewInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
			return
		}
		a, err := service.ReviewApplication(c.Request.Context(), userID, id, appID, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"application": a, "message": "Application updated."})
	}
}

func createTeamHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		var input CreateTeamInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
			return
		}
		t, err := service.CreateTeam(c.Request.Context(), userID, id, input)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"team":    t,
			"message": fmt.Sprintf("Team %s is ready. Invite your teammates to join. 🤝", t.Name),
		})
	}
}

func listTeamsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		list, err := service.ListTeams(c.Request.Context(), id)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		if list == nil {
			list = []*Team{}
		}
		c.JSON(http.StatusOK, gin.H{"teams": list})
	}
}

func getTeamHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		teamID := c.Param("teamID")
		t, err := service.GetTeam(c.Request.Context(), id, teamID)
		if err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, t)
	}
}

func joinTeamHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		teamID := c.Param("teamID")
		if err := service.JoinTeam(c.Request.Context(), userID, id, teamID); err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "You're on the team! 🤝"})
	}
}

func leaveTeamHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		teamID := c.Param("teamID")
		if err := service.LeaveTeam(c.Request.Context(), userID, id, teamID); err != nil {
			c.JSON(statusForError(err), gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "You've left the team."})
	}
}
