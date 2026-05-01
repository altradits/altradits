package main

import (
	"fmt"
	"html/template"
	"math/rand"
	"net/http"
	"time"
)

type Data struct {
	Balance float64
	Time    string
}

func main() {
	// 1. Initial Page Load
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "balance.html"))
		tmpl.ExecuteTemplate(w, "index.html", Data{Balance: 100.0, Time: time.Now().Format("15:04:05")})
	})

	// 2. HTMX Endpoint (Partial Update)
	http.HandleFunc("/refresh-balance", func(w http.ResponseWriter, r *http.Request) {
		// Simulate a logic engine update from Phase 1
		newBalance := 100.0 + rand.Float64()*50.0
		data := Data{
			Balance: newBalance,
			Time:    time.Now().Format("15:04:05"),
		}

		// We ONLY parse and execute the partial file
		tmpl := template.Must(template.ParseFiles("balance.html"))
		tmpl.Execute(w, data)
	})

	fmt.Println("HTMX Engine online at http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}