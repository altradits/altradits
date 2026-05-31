package capture

import (
	"github.com/gin-gonic/gin"
)

// capture: Quick capture, chat capture, todo capture, SMS capture, OCR capture.

// CaptureHandler handles the capture endpoint.
func CaptureHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "capture stub"})
	}
}
