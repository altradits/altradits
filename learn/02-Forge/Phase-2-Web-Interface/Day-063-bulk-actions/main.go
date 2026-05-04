package main

import (
	"fmt"
	"html/template"
	"net/http"
)

type Tx struct {
	ID     string
	Status string
}

var vault = []Tx{
	{"ALTR-001", "Pending"},
	{"ALTR-002", "Pending"},
	{"ALTR-003", "Pending"},
	{"ALTR-004", "Pending"},
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "ledger_rows.html"))
		tmpl.ExecuteTemplate(w, "index.html", vault)
	})

	// Bulk Action Endpoint
	http.HandleFunc("/bulk-approve", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		ids := r.Form["tx_ids"] // Go collects multiple inputs with the same name into a slice

		// Update the global state
		for _, id := range ids {
			for i, tx := range vault {
				if tx.ID == id {
					vault[i].Status = "Approved"
				}
			}
		}

		// Re-render the table rows only
		tmpl := template.Must(template.ParseFiles("ledger_rows.html"))
		tmpl.Execute(w, vault)
	})

	fmt.Println("Bulk Processor: http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}