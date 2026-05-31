package bedtime

import (
	"github.com/gin-gonic/gin"
)

// bedtime: Module for bedtime

// BedtimeCloseHandler handles the bedtime endpoint.
func BedtimeCloseHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "bedtime close stub"})
	}
}
