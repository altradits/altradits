package affordability

import (
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// affordability: Module for affordability

// AffordabilityCheckHandler handles the affordability endpoint.
func AffordabilityCheckHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input CheckInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(400, gin.H{"error": "item and amount are required"})
			return
		}

		service := NewService(db)
		// For backward compatibility, use empty userID if not in context
		userID := ""
		if uid, exists := c.Get("user_id"); exists {
			userID = uid.(string)
		}
		result, err := service.Check(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(500, gin.H{"error": "could not check affordability"})
			return
		}

		c.JSON(200, result)
	}
}
