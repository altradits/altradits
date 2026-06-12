package auth

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const UserIDKey = "user_id"
const IsAdminKey = "is_admin"

// Middleware returns a Gin middleware that validates JWT tokens.
// Protected routes will return 401 if the token is missing or invalid.
func (s *Service) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(401, gin.H{"error": "authentication required"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.JSON(401, gin.H{"error": "invalid authorization header format"})
			c.Abort()
			return
		}

		claims, err := s.Verify(parts[1])
		if err != nil {
			c.JSON(401, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}

		// Store user info in context for downstream handlers
		c.Set(UserIDKey, claims.UserID)
		c.Set(IsAdminKey, claims.IsAdmin)
		c.Next()
	}
}

// AdminMiddleware returns a Gin middleware that requires the authenticated
// user to be an admin. Must be used after Middleware().
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !IsAdmin(c) {
			c.JSON(403, gin.H{"error": "admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// GetUserID extracts the user ID from the Gin context.
// Returns empty string if not authenticated.
func GetUserID(c *gin.Context) string {
	if id, exists := c.Get(UserIDKey); exists {
		if strID, ok := id.(string); ok {
			return strID
		}
	}
	return ""
}

// IsAdmin reports whether the authenticated user has admin privileges.
func IsAdmin(c *gin.Context) bool {
	if v, exists := c.Get(IsAdminKey); exists {
		if isAdmin, ok := v.(bool); ok {
			return isAdmin
		}
	}
	return false
}
