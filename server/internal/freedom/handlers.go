package freedom

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetFreedomPlan returns the full freedom plan.
func GetFreedomPlan(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		plan, err := service.GetPlan(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load freedom plan"})
			return
		}
		c.JSON(http.StatusOK, plan)
	}
}

// SetFreedomTargets updates the user's savings target.
func SetFreedomTargets(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input TargetInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "monthly_savings and target_passive are required"})
			return
		}
		target, err := service.SetTarget(c.Request.Context(), input)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update freedom target"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"target":   target,
			"message":  "Freedom target updated. 🌱",
		})
	}
}
