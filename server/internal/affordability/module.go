package affordability

import (
	"github.com/gin-gonic/gin"
)

// affordability: Answers: "Can I afford this?" Uses cashflow, goals, saving behavior, upcoming obligations, and risk tolerance.

// AffordabilityCheckHandler handles the affordability check endpoint.
func AffordabilityCheckHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "affordability check stub"})
	}
}
