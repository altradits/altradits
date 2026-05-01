package main

import (
	"fmt"
	"html/template"
	"net/http"
	"strings"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, nil)
	})

	// Inline Validation Endpoint
	http.HandleFunc("/validate/account", func(w http.ResponseWriter, r *http.Request) {
		acc := r.FormValue("account_number")
		
		var msg string
		var isValid bool

		// Business Rule: Account must start with 'ALTR-' and be 10 characters total
		if !strings.HasPrefix(acc, "ALTR-") {
			msg = "ID must begin with 'ALTR-'"
			isValid = false
		} else if len(acc) != 10 {
			msg = fmt.Sprintf("ID length: %d/10", len(acc))
			isValid = false
		} else {
			msg = "Valid System ID"
			isValid = true
		}

		tmpl := template.Must(template.ParseFiles("validation.html"))
		tmpl.Execute(w, map[string]interface{}{
			"Message": msg,
			"IsValid": isValid,
		})
	})

	fmt.Println("Validation Engine: http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}