package budget

import (
	"github.com/gin-gonic/gin"
)

// budget: Budget engine.

// BudgetHandler handles the budget endpoint.
func BudgetHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "budget stub"})
	}
}
