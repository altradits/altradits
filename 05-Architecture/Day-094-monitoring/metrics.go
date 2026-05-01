package main

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// Count total transactions processed
	opsProcessed = promauto.NewCounter(prometheus.CounterOpts{
		Name: "altradits_processed_ops_total",
		Help: "The total number of processed transactions",
	})

	// Track how long requests take
	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "altradits_http_duration_seconds",
		Help:    "Duration of HTTP requests.",
		Buckets: prometheus.DefBuckets,
	}, []string{"path"})
)