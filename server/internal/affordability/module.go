package affordability

import (
	"github.com/gin-gonic/gin"
)

// affordability: Module for affordability

// AffordabilityCheckHandler handles the affordability endpoint.
func AffordabilityCheckHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "affordability check stub"})
	}
}
