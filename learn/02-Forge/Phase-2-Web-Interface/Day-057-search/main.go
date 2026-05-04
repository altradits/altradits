package main

import (
	"html/template"
	"net/http"
	"strings"
)

type Transaction struct {
	ID     string
	Target string
	Amount float64
}

var ledger = []Transaction{
	{"TX-101", "Supplier A", 450.00},
	{"TX-102", "Cloud Hosting", 120.50},
	{"TX-103", "Stan Style Forge", 0.00},
	{"TX-104", "Payroll", 5000.00},
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, ledger)
	})

	http.HandleFunc("/search", func(w http.ResponseWriter, r *http.Request) {
		query := strings.ToLower(r.FormValue("search"))
		var results []Transaction

		for _, tx := range ledger {
			if strings.Contains(strings.ToLower(tx.Target), query) || strings.Contains(strings.ToLower(tx.ID), query) {
				results = append(results, tx)
			}
		}

		tmpl := template.Must(template.ParseFiles("results.html"))
		tmpl.Execute(w, results)
	})

	http.ListenAndServe(":8080", nil)
}