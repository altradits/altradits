package main

import (
	"html/template"
	"math/rand"
	"net/http"
	"time"
)

type SystemStats struct {
	CPUUsage int
	Uptime   string
	Status   string
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "status.html"))
		tmpl.Execute(w, nil)
	})

	// Polling Endpoint
	http.HandleFunc("/system/status", func(w http.ResponseWriter, r *http.Request) {
		stats := SystemStats{
			CPUUsage: rand.Intn(100),
			Uptime:   time.Since(time.Now().Add(-24 * time.Hour)).Truncate(time.Second).String(),
			Status:   "Healthy",
		}
		
		if stats.CPUUsage > 80 {
			stats.Status = "Strained"
		}

		tmpl := template.Must(template.ParseFiles("status.html"))
		tmpl.Execute(w, stats)
	})

	http.ListenAndServe(":8080", nil)
}