package wallet

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// LNURL-pay (LUD-06/LUD-16) sendable bounds, in millisatoshis.
const (
	lnurlMinSendableMsat = 1_000           // 1 sat
	lnurlMaxSendableMsat = 100_000_000_000 // 1,000,000 sats
)

// RegisterPublicRoutes wires the LNURL-pay endpoints that let external
// Lightning wallets pay a user's Lightning address (username@<domain>)
// directly. These are unauthenticated by design — they're how other wallets
// discover how to pay us.
func RegisterPublicRoutes(r gin.IRouter, service *Service) {
	r.GET("/.well-known/lnurlp/:username", lnurlMetadataHandler(service))
	r.GET("/lnurlp/:username/callback", lnurlCallbackHandler(service))
}

func lnurlError(c *gin.Context, status int, reason string) {
	c.JSON(status, gin.H{"status": "ERROR", "reason": reason})
}

func lookupUserIDByUsername(ctx context.Context, service *Service, username string) (string, error) {
	var userID string
	err := service.db.QueryRow(ctx, `SELECT id::text FROM users WHERE LOWER(username) = LOWER($1)`, username).Scan(&userID)
	if err != nil {
		return "", err
	}
	return userID, nil
}

func lnurlMetadataHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		username := c.Param("username")
		if _, err := lookupUserIDByUsername(c.Request.Context(), service, username); err != nil {
			lnurlError(c, http.StatusNotFound, "User not found")
			return
		}

		scheme := "http"
		if proto := c.Request.Header.Get("X-Forwarded-Proto"); proto != "" {
			scheme = proto
		} else if c.Request.TLS != nil {
			scheme = "https"
		}

		address := username + "@" + lightningAddressDomain()
		metadata := fmt.Sprintf(`[["text/plain","Pay %s"],["text/identifier","%s"]]`, address, address)

		c.JSON(http.StatusOK, gin.H{
			"callback":    fmt.Sprintf("%s://%s/lnurlp/%s/callback", scheme, c.Request.Host, username),
			"maxSendable": lnurlMaxSendableMsat,
			"minSendable": lnurlMinSendableMsat,
			"metadata":    metadata,
			"tag":         "payRequest",
		})
	}
}

func lnurlCallbackHandler(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		username := c.Param("username")
		userID, err := lookupUserIDByUsername(c.Request.Context(), service, username)
		if err != nil {
			lnurlError(c, http.StatusNotFound, "User not found")
			return
		}

		amountMsat, err := strconv.ParseInt(c.Query("amount"), 10, 64)
		if err != nil || amountMsat < lnurlMinSendableMsat || amountMsat > lnurlMaxSendableMsat {
			lnurlError(c, http.StatusBadRequest, "Amount out of range")
			return
		}

		tx, err := service.DepositLightning(c.Request.Context(), userID, DepositLightningInput{
			AmountSats: amountMsat / 1000,
			Memo:       "Lightning address payment",
		})
		if err != nil {
			lnurlError(c, http.StatusInternalServerError, "Could not generate invoice")
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"pr":     tx.LightningInvoice,
			"routes": []any{},
		})
	}
}
