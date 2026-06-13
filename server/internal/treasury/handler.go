package treasury

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/altradits/altradits/server/internal/auth"
)

// RegisterRoutes wires customer-facing pool endpoints onto the given
// (authenticated) router group.
func RegisterRoutes(api gin.IRouter, service *Service) {
	api.GET("/wallet/pool/allocation", getAllocationHandler(service))
	api.GET("/wallet/pool/interest", getInterestHandler(service))
}

// RegisterAdminRoutes wires admin-only pool management endpoints onto the
// given router group, using paths relative to the group's "/admin" prefix.
// The group should already have auth and admin middleware applied.
func RegisterAdminRoutes(admin gin.IRouter, service *Service) {
	admin.POST("/pool/accrue-interest", accrueInterestHandler(service))
	admin.GET("/pool/overview", getPoolOverviewHandler(service))
	admin.GET("/pool/nav-history", getNAVHistoryHandler(service))
	admin.GET("/pool/risk", getRiskReportHandler(service))
	admin.GET("/pool/alerts", getAlertsHandler(service))
	admin.GET("/pool/config", getConfigHandler(service))
	admin.PUT("/pool/config", updateConfigHandler(service))
	admin.PUT("/pool/allocation", updateAllocationHandler(service))
	admin.GET("/pool/rebalance-log", getRebalanceLogHandler(service))
}

func getAllocationHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		assets, err := service.GetAllocation(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load pool allocation"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"assets": assets})
	}
}

func getInterestHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		summary, err := service.GetUserInterestSummary(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load interest summary"})
			return
		}
		c.JSON(http.StatusOK, summary)
	}
}

func accrueInterestHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		result, err := service.AccrueInterest(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, result)
	}
}

func getPoolOverviewHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		overview, err := service.GetPoolOverview(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load pool overview"})
			return
		}
		c.JSON(http.StatusOK, overview)
	}
}

func getNAVHistoryHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		days, _ := strconv.Atoi(c.Query("days"))
		points, err := service.GetNAVHistory(c.Request.Context(), days)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load NAV history"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"history": points})
	}
}

func getRiskReportHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		report, err := service.GetRiskReport(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load risk report"})
			return
		}
		c.JSON(http.StatusOK, report)
	}
}

func getAlertsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		alerts, err := service.GetAlerts(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load alerts"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"alerts": alerts})
	}
}

func getConfigHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		config, err := service.GetConfig(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load pool config"})
			return
		}
		c.JSON(http.StatusOK, config)
	}
}

func updateConfigHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input PoolConfig
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bank_fee_pct and target_apy_pct are required"})
			return
		}
		config, err := service.UpdateConfig(c.Request.Context(), input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, config)
	}
}

func updateAllocationHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input struct {
			Entries []RebalanceEntry `json:"entries"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "entries is required"})
			return
		}

		userID := auth.GetUserID(c)
		assets, err := service.UpdateAllocation(c.Request.Context(), userID, input.Entries)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"assets": assets})
	}
}

func getRebalanceLogHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.Query("limit"))
		entries, err := service.GetRebalanceLog(c.Request.Context(), limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load rebalance log"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"entries": entries})
	}
}
