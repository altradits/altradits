package main

import (
	"html/template"
	"net/http"
	"strings"
)

type LogEntry struct {
	ID      string
	Message string
}

var activityLogs = []LogEntry{
	{"L-1", "Auth attempt from 192.168.1.1"},
	{"L-2", "Vault Sweep initiated by Stan"},
	{"L-3", "Minor anomaly detected in Sector 7"},
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "list.html"))
		tmpl.Execute(w, activityLogs)
	})

	// DELETE /log/L-1
	http.HandleFunc("/log/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			id := strings.TrimPrefix(r.URL.Path, "/log/")
			
			// Update local slice (Simulating DB delete)
			for i, log := range activityLogs {
				if log.ID == id {
					activityLogs = append(activityLogs[:i], activityLogs[i+1:]...)
					break
				}
			}
			
			// Return 200 OK with no body. HTMX will remove the target element.
			w.WriteHeader(http.StatusOK)
		}
	})

	http.ListenAndServe(":8080", nil)
}