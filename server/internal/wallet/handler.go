package wallet

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/altradits/altradits/server/internal/auth"
	"github.com/gin-gonic/gin"
)

// RegisterRoutes wires wallet endpoints onto the given router group. The
// group should already have auth middleware applied.
func RegisterRoutes(api gin.IRouter, service *Service) {
	api.GET("/wallet/balance", getBalanceHandler(service))
	api.GET("/wallet/rate", getRateHandler(service))
	api.GET("/wallet/price", getPriceInfoHandler(service))
	api.GET("/wallet/transactions", listTransactionsHandler(service))
	api.GET("/wallet/transactions/export", exportTransactionsHandler(service))
	api.POST("/wallet/deposit/mpesa", depositMpesaHandler(service))
	api.POST("/wallet/deposit/lightning", depositLightningHandler(service))
	api.POST("/wallet/deposit/lightning/:id/simulate", simulateLightningHandler(service))
	api.GET("/wallet/deposit/lightning/:id/status", checkLightningDepositHandler(service))
	api.POST("/wallet/withdraw/mpesa", withdrawMpesaHandler(service))
	api.POST("/wallet/withdraw/lightning", withdrawLightningHandler(service))
	api.PUT("/wallet/settings", updateSettingsHandler(service))
}

func getBalanceHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		balance, err := service.GetBalance(c.Request.Context(), userID)
		if err != nil {
			if errors.Is(err, ErrUserNotFound) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load wallet balance"})
			return
		}
		c.JSON(http.StatusOK, balance)
	}
}

func getRateHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		rate, err := service.rates.GetRate(c.Request.Context())
		if err != nil && rate.BTCToKES == 0 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load exchange rate"})
			return
		}
		c.JSON(http.StatusOK, rate)
	}
}

func getPriceInfoHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		info, err := service.rates.GetPriceInfo(c.Request.Context())
		if err != nil && info.Rate.BTCToKES == 0 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load price"})
			return
		}
		c.JSON(http.StatusOK, info)
	}
}

func listTransactionsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		limit := 50
		if raw := c.Query("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil {
				limit = n
			}
		}
		transactions, err := service.ListTransactions(c.Request.Context(), userID, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load transactions"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"transactions": transactions})
	}
}

func exportTransactionsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		csvBytes, err := service.ExportTransactionsCSV(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not export transactions"})
			return
		}
		c.Header("Content-Disposition", "attachment; filename=wallet-transactions.csv")
		c.Data(http.StatusOK, "text/csv", csvBytes)
	}
}

func depositMpesaHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input DepositMpesaInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "amount_kes and phone_number are required"})
			return
		}
		txn, err := service.DepositMpesa(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"transaction": txn,
			"message":     "M-Pesa deposit confirmed. Your wallet has been topped up. 🌱",
		})
	}
}

func depositLightningHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input DepositLightningInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "amount_sats is required"})
			return
		}
		txn, err := service.DepositLightning(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"transaction": txn,
			"message":     "Invoice ready. Pay it to complete your deposit.",
		})
	}
}

func simulateLightningHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		txn, err := service.SimulateLightningDeposit(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"transaction": txn,
			"message":     "Payment received. Your wallet has been topped up. 🌱",
		})
	}
}

func checkLightningDepositHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		id := c.Param("id")
		txn, err := service.CheckLightningDeposit(c.Request.Context(), userID, id)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"transaction": txn})
	}
}

func withdrawMpesaHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input WithdrawMpesaInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "amount_sats and phone_number are required"})
			return
		}
		txn, err := service.WithdrawMpesa(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"transaction": txn,
			"message":     "Withdrawal sent to your phone. 🌱",
		})
	}
}

func withdrawLightningHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input WithdrawLightningInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "amount_sats and destination are required"})
			return
		}
		txn, err := service.WithdrawLightning(c.Request.Context(), userID, input)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{
			"transaction": txn,
			"message":     "Sent over Lightning. ⚡",
		})
	}
}

func updateSettingsHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := auth.GetUserID(c)
		var input SettingsInput
		if err := c.ShouldBindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid settings"})
			return
		}
		if err := service.UpdateSettings(c.Request.Context(), userID, input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Wallet settings updated. 🌱"})
	}
}
