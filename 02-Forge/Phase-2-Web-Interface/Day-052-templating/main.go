package main

import (
	"html/template"
	"log"
	"net/http"
)

// Dashboard defines the data structure the Founder will interact with.
type Dashboard struct {
	FounderName string
	SystemID    string
	Balance     float64
	IsSecure    bool
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Mock data representing a system state from Phase 1
		data := Dashboard{
			FounderName: "Stan",
			SystemID:    "ALTR-ALPHA-01",
			Balance:     15000.50,
			IsSecure:    true,
		}

		// Parse the index file
		tmpl, err := template.ParseFiles("index.html")
		if err != nil {
			log.Printf("Template parsing error: %v", err)
			http.Error(w, "Internal Server Error", 500)
			return
		}

		// Execute the template by merging the Dashboard struct into the HTML
		err = tmpl.Execute(w, data)
		if err != nil {
			log.Printf("Template execution error: %v", err)
		}
	})

	log.Println("Altradits Interface active at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}