package main

import (
	"fmt"
	"html/template"
	"net/http"
	"strconv"
)

type Item struct {
	ID    int
	Label string
}

func main() {
	// Generate 100 mock transactions
	var database []Item
	for i := 1; i <= 100; i++ {
		database = append(database, Item{ID: i, Label: fmt.Sprintf("Transaction #%04d", i)})
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "rows.html"))
		// Initial load: first 20 items
		tmpl.ExecuteTemplate(w, "index.html", map[string]interface{}{
			"Items": database[:20],
			"Next":  1,
		})
	})

	http.HandleFunc("/load-more", func(w http.ResponseWriter, r *http.Request) {
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		start := page * 20
		end := start + 20

		if start >= len(database) {
			return // No more data
		}
		if end > len(database) {
			end = len(database)
		}

		tmpl := template.Must(template.ParseFiles("rows.html"))
		tmpl.Execute(w, map[string]interface{}{
			"Items": database[start:end],
			"Next":  page + 1,
			"Last":  end == len(database),
		})
	})

	fmt.Println("Ledger Stream: http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}