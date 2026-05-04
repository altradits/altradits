package main

import (
	"fmt"
	"html/template"
	"math/rand"
	"net/http"
	"time"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, nil)
	})

	// SSE Endpoint: The "Ticker"
	http.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		// Set headers for SSE
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		for {
			// Simulate a live balance change
			newBalance := 50000 + rand.Intn(1000)
			
			// SSE Format: data: <content>\n\n
			// We send an HTML fragment that HTMX will pick up
			fmt.Fprintf(w, "data: <div id='live-balance' class='text-emerald-400'>$%d</div>\n\n", newBalance)
			
			// Flush the data immediately to the client
			flusher, ok := w.(http.Flusher)
			if ok {
				flusher.Flush()
			}

			// Wait 3 seconds before the next update
			time.Sleep(3 * time.Second)
		}
	})

	fmt.Println("Altradits SSE Stream active at http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}