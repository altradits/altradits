package main

import (
	"html/template"
	"net/http"
	"time"
)

type PageData struct {
	Balance float64
	LastUpdated string
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		data := PageData{
			Balance: 25000.00,
			LastUpdated: time.Now().Format("15:04:05"),
		}

		// We parse the layout AND the partial. 
		// The layout calls the partial.
		tmpl := template.Must(template.ParseFiles("layout.html", "balance.html"))
		tmpl.ExecuteTemplate(w, "layout", data)
	})

	http.ListenAndServe(":8080", nil)
}