package admin

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// RegisterRoutes wires admin endpoints onto the given router group, using
// paths relative to the group's "/admin" prefix. The group should already
// have auth and admin middleware applied.
func RegisterRoutes(api gin.IRouter, service *Service) {
	api.GET("/stats", getStatsHandler(service))
	api.GET("/users", listUsersHandler(service))
	api.GET("/transactions", listTransactionsHandler(service))
}

func getStatsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := service.GetBankStats(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load bank stats"})
			return
		}
		c.JSON(http.StatusOK, stats)
	}
}

func listUsersHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		users, err := service.ListUsers(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load users"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"users": users})
	}
}

func listTransactionsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit := 50
		if raw := c.Query("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil {
				limit = n
			}
		}
		transactions, err := service.ListTransactions(c.Request.Context(), limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load transactions"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"transactions": transactions})
	}
}
