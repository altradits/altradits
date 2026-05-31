package forecast

import (
	"github.com/gin-gonic/gin"
)

// forecast: Module for forecast

// ForecastHandler handles the forecast endpoint.
func ForecastHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Stub implementation
		c.JSON(200, gin.H{"message": "forecast stub"})
	}
}
