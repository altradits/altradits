package liquidity

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/altradits/altradits/server/internal/auth"
)

// RegisterAdminRoutes wires node-operator/liquidity-manager endpoints onto
// the given router group, using paths relative to the group's "/admin"
// prefix. The group should already have auth and admin middleware applied.
func RegisterAdminRoutes(admin gin.IRouter, service *Service) {
	admin.GET("/liquidity/overview", getOverviewHandler(service))
	admin.GET("/liquidity/node-status", getNodeStatusHandler(service))
	admin.GET("/liquidity/channels", getChannelsHandler(service))
	admin.GET("/liquidity/peers", getPeersHandler(service))
	admin.GET("/liquidity/onchain", getOnchainHandler(service))
	admin.GET("/liquidity/routing-fees", getRoutingFeesHandler(service))
	admin.GET("/liquidity/mpesa-queues", getMpesaQueuesHandler(service))
	admin.GET("/liquidity/alerts", getAlertsHandler(service))
	admin.GET("/liquidity/config", getConfigHandler(service))
	admin.PUT("/liquidity/config", updateConfigHandler(service))
	admin.GET("/liquidity/action-log", getActionLogHandler(service))
	admin.POST("/liquidity/channels/open", openChannelHandler(service))
	admin.POST("/liquidity/channels/:id/close", closeChannelHandler(service))
	admin.PUT("/liquidity/channels/:id/fee", updateChannelFeeHandler(service))
	admin.POST("/liquidity/rebalance", rebalanceHandler(service))
	admin.POST("/liquidity/swap", swapHandler(service))
	admin.POST("/liquidity/mpesa-float/replenish", mpesaReplenishHandler(service))
	admin.POST("/liquidity/mpesa-float/sweep", mpesaSweepHandler(service))
}

func getOverviewHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		overview, err := service.GetOverview(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load liquidity overview"})
			return
		}
		c.JSON(http.StatusOK, overview)
	}
}

func getNodeStatusHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		status, err := service.GetNodeStatus(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load node status"})
			return
		}
		c.JSON(http.StatusOK, status)
	}
}

func getChannelsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		channels, err := service.GetChannels(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load channels"})
			return
		}
		c.JSON(http.StatusOK, channels)
	}
}

func getPeersHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		peers, err := service.GetPeers(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load peers"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"peers": peers})
	}
}

func getOnchainHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		info, err := service.GetOnchain(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load on-chain info"})
			return
		}
		c.JSON(http.StatusOK, info)
	}
}

func getRoutingFeesHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		days, _ := strconv.Atoi(c.Query("days"))
		points, err := service.GetRoutingFeeHistory(c.Request.Context(), days)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load routing fee history"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"history": points})
	}
}

func getMpesaQueuesHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		queues, err := service.GetMpesaQueues(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load M-Pesa queues"})
			return
		}
		c.JSON(http.StatusOK, queues)
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load liquidity config"})
			return
		}
		c.JSON(http.StatusOK, config)
	}
}

func updateConfigHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input Config
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid liquidity config"})
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

func getActionLogHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		limit, _ := strconv.Atoi(c.Query("limit"))
		entries, err := service.GetActionLog(c.Request.Context(), limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load action log"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"entries": entries})
	}
}

func openChannelHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input OpenChannelRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "peer_alias and capacity_sats are required"})
			return
		}
		userID := auth.GetUserID(c)
		channel, err := service.OpenChannel(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, channel)
	}
}

func closeChannelHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		if err := service.CloseChannel(c.Request.Context(), userID, c.Param("id")); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "closed"})
	}
}

func updateChannelFeeHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input UpdateFeeRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "fee_rate_ppm and base_fee_msat are required"})
			return
		}
		userID := auth.GetUserID(c)
		channel, err := service.UpdateChannelFee(c.Request.Context(), userID, c.Param("id"), input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, channel)
	}
}

func rebalanceHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input RebalanceRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "from_channel_id, to_channel_id, and amount_sats are required"})
			return
		}
		userID := auth.GetUserID(c)
		if err := service.Rebalance(c.Request.Context(), userID, input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "rebalanced"})
	}
}

func swapHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input SwapRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "direction, channel_id, and amount_sats are required"})
			return
		}
		userID := auth.GetUserID(c)
		if err := service.ExecuteSwap(c.Request.Context(), userID, input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "swapped"})
	}
}

func mpesaReplenishHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input FloatAdjustRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "amount_kes is required"})
			return
		}
		userID := auth.GetUserID(c)
		if err := service.MpesaReplenish(c.Request.Context(), userID, input.AmountKES); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "replenished"})
	}
}

func mpesaSweepHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var input FloatAdjustRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "amount_kes is required"})
			return
		}
		userID := auth.GetUserID(c)
		if err := service.MpesaSweep(c.Request.Context(), userID, input.AmountKES); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "swept"})
	}
}
