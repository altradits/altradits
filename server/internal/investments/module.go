package investments

import (
	"github.com/gin-gonic/gin"
)

// investments: Module for investments

// InvestmentsHandler handles the investments endpoint.
func InvestmentsHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "investments stub"})
	}
}
