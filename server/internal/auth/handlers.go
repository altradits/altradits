package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RegisterHandler handles user registration.
func (s *Service) RegisterHandler(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := s.Register(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, response)
}

// LoginHandler handles user login.
func (s *Service) LoginHandler(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response, err := s.Login(c.Request.Context(), input)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, response)
}

// MeHandler returns the current user's profile.
func (s *Service) MeHandler(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	user, err := s.Me(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// LogoutHandler revokes the current session token.
func (s *Service) LogoutHandler(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" {
		parts := splitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			_ = s.Logout(c.Request.Context(), parts[1])
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func splitN(s, sep string, n int) []string {
	// simple split for Bearer token extraction
	result := make([]string, 0, 2)
	for i := 0; i < len(s) && len(result) < n-1; i++ {
		if s[i] == sep[0] {
			result = append(result, s[:i])
			s = s[i+1:]
			break
		}
	}
	result = append(result, s)
	return result
}
