package main

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
	"time"
)

// Middleware: Request Logger
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("FORGE_ACCESS: %s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	mux := http.NewServeMux()

	// 1. Root: The Shell
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "partials.html"))
		tmpl.ExecuteTemplate(w, "index.html", map[string]interface{}{
			"Time":    time.Now().Format("15:04:05"),
			"Status":  "Operational",
			"Balance": 125000.42,
		})
	})

	// 2. Partial: Live Metric Update (HTMX)
	mux.HandleFunc("/api/metric", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("partials.html"))
		tmpl.ExecuteTemplate(w, "metric-box", map[string]interface{}{
			"Balance": 125000.42 + (time.Now().Seconds() * 0.1),
			"Time":    time.Now().Format("15:04:05"),
		})
	})

	fmt.Println("🚀 ALTRADITS COMMAND CENTER: http://localhost:8080")
	http.ListenAndServe(":8080", Logger(mux))
}