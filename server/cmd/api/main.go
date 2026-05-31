package main

import (
	"github.com/altradits/altradits/server/internal/affordability"
	"github.com/altradits/altradits/server/internal/bedtime"
	"github.com/altradits/altradits/server/internal/budget"
	"github.com/altradits/altradits/server/internal/capture"
	"github.com/altradits/altradits/server/internal/forecast"
	"github.com/altradits/altradits/server/internal/goals"
	"github.com/altradits/altradits/server/internal/investments"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	// API routes
	r.POST("/capture", capture.CaptureHandler())
	r.POST("/bedtime/close", bedtime.BedtimeCloseHandler())
	r.POST("/affordability/check", affordability.AffordabilityCheckHandler())
	r.GET("/forecast", forecast.ForecastHandler())
	r.GET("/budget", budget.BudgetHandler())
	r.GET("/goals", goals.GoalsHandler())
	r.GET("/investments", investments.InvestmentsHandler())

	r.Run() // listen and serve on 0.0.0.0:8080
}