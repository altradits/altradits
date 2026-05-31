package capture

import (
	"github.com/gin-gonic/gin"
)

// capture: Module for capture

// CaptureHandler handles the capture endpoint.
func CaptureHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "capture stub"})
	}
}
