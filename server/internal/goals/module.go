package goals

import (
	"github.com/gin-gonic/gin"
)

// goals: Savings targets.

// GoalsHandler handles the goals endpoint.
func GoalsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "goals stub"})
	}
}
