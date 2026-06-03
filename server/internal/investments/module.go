package investments

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GetInvestmentsHandler handles GET /investments
func GetInvestmentsHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		service := NewService(db)
		positions, err := service.List(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not retrieve investments"})
			return
		}
		// Convert Position to the format expected by frontend
		var investments []map[string]interface{}
		for _, p := range positions {
			investments = append(investments, map[string]interface{}{
				"id":              p.ID,
				"name":            p.Name,
				"institution":     p.Institution,
				"type":            p.Type,
				"current_value":   p.CurrentValue,
				"invested_amount": p.Principal,
				"currency":        p.Currency,
				"notes": func() string {
					if p.Notes != nil {
						return *p.Notes
					}
					return ""
				}(),
				"is_active": p.IsActive,
				"started_at": func() string {
					if p.StartedAt != nil {
						return *p.StartedAt
					}
					return ""
				}(),
				"matures_at": func() string {
					if p.MaturesAt != nil {
						return *p.MaturesAt
					}
					return ""
				}(),
				"created_at": p.CreatedAt.Format(time.RFC3339),
				"updated_at": p.CreatedAt.Format(time.RFC3339), // service doesn't have updated_at, using created_at as fallback
			})
		}
		c.JSON(http.StatusOK, investments)
	}
}

// CreateInvestmentHandler handles POST /investments
func CreateInvestmentHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input CreateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid investment data"})
			return
		}
		service := NewService(db)
		createdInv, err := service.Create(c.Request.Context(), input)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create investment"})
			return
		}
		// Convert Position to frontend expected format
		investment := map[string]interface{}{
			"id":              createdInv.ID,
			"name":            createdInv.Name,
			"institution":     createdInv.Institution,
			"type":            createdInv.Type,
			"current_value":   createdInv.CurrentValue,
			"invested_amount": createdInv.Principal,
			"currency":        createdInv.Currency,
			"notes": func() string {
				if createdInv.Notes != nil {
					return *createdInv.Notes
				}
				return ""
			}(),
			"is_active": createdInv.IsActive,
			"started_at": func() string {
				if createdInv.StartedAt != nil {
					return *createdInv.StartedAt
				}
				return ""
			}(),
			"matures_at": func() string {
				if createdInv.MaturesAt != nil {
					return *createdInv.MaturesAt
				}
				return ""
			}(),
			"created_at": createdInv.CreatedAt.Format(time.RFC3339),
			"updated_at": createdInv.CreatedAt.Format(time.RFC3339),
		}
		c.JSON(http.StatusCreated, investment)
	}
}

// UpdateInvestmentHandler handles PUT /investments/:id
func UpdateInvestmentHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if id == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "investment ID is required"})
			return
		}

		var input UpdateInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid investment data"})
			return
		}

		service := NewService(db)
		updatedInv, err := service.Update(c.Request.Context(), id, input)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update investment"})
			return
		}
		// Convert Position to frontend expected format
		investment := map[string]interface{}{
			"id":              updatedInv.ID,
			"name":            updatedInv.Name,
			"institution":     updatedInv.Institution,
			"type":            updatedInv.Type,
			"current_value":   updatedInv.CurrentValue,
			"invested_amount": updatedInv.Principal,
			"currency":        updatedInv.Currency,
			"notes": func() string {
				if updatedInv.Notes != nil {
					return *updatedInv.Notes
				}
				return ""
			}(),
			"is_active": updatedInv.IsActive,
			"started_at": func() string {
				if updatedInv.StartedAt != nil {
					return *updatedInv.StartedAt
				}
				return ""
			}(),
			"matures_at": func() string {
				if updatedInv.MaturesAt != nil {
					return *updatedInv.MaturesAt
				}
				return ""
			}(),
			"created_at": updatedInv.CreatedAt.Format(time.RFC3339),
			"updated_at": updatedInv.CreatedAt.Format(time.RFC3339),
		}
		c.JSON(http.StatusOK, investment)
	}
}

// DeleteInvestmentHandler handles DELETE /investments/:id
func DeleteInvestmentHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if id == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "investment ID is required"})
			return
		}

		service := NewService(db)
		err := service.Delete(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete investment"})
			return
		}
		c.Status(http.StatusNoContent)
	}
}

// GetInvestmentSummaryHandler handles GET /investments/summary
func GetInvestmentSummaryHandler(db *pgxpool.Pool) gin.HandlerFunc {
	return func(c *gin.Context) {
		service := NewService(db)
		summary, err := service.Summary(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not retrieve investment summary"})
			return
		}
		// Convert Portfolio to frontend expected format
		allocationMap := make(map[string]float64)
		for _, alloc := range summary.Allocation {
			allocationMap[alloc.Type] = alloc.Percent
		}
		frontendSummary := map[string]interface{}{
			"total_invested":      summary.TotalPrincipal,
			"total_current_value": summary.TotalValue,
			"total_growth":        summary.TotalGrowth,
			"allocation":          allocationMap,
		}
		c.JSON(http.StatusOK, frontendSummary)
	}
}
