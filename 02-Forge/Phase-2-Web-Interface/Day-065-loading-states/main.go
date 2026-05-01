package main

import (
	"html/template"
	"net/http"
	"time"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, nil)
	})

	// Simulate a heavy backend audit process
	http.HandleFunc("/run-audit", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(3 * time.Second) // Simulated latency
		
		tmpl := template.Must(template.ParseFiles("audit_results.html"))
		tmpl.Execute(w, map[string]interface{}{
			"Status": "Passed",
			"Score":  99.8,
			"Time":   time.Now().Format("15:04:05"),
		})
	})

	http.ListenAndServe(":8080", nil)
}