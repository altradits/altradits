package main

import (
	"fmt"
	"html/template"
	"net/http"
	"strconv"
)

type Feedback struct {
	Success bool
	Message string
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, nil)
	})

	// HTMX POST Endpoint
	http.HandleFunc("/transact", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// 1. Capture Form Data
		amountStr := r.PostFormValue("amount")
		amount, err := strconv.ParseFloat(amountStr, 64)

		// 2. Validation Logic (The "Altradits Guardrail")
		var feedback Feedback
		if err != nil || amount <= 0 {
			feedback = Feedback{Success: false, Message: "Invalid Amount: Must be a positive number."}
		} else if amount > 10000 {
			feedback = Feedback{Success: false, Message: "Limit Exceeded: Transactions capped at $10,000."}
		} else {
			feedback = Feedback{Success: true, Message: fmt.Sprintf("Success: $%v moved to vault.", amount)}
		}

		// 3. Render only the response snippet
		tmpl := template.Must(template.ParseFiles("response.html"))
		tmpl.Execute(w, feedback)
	})

	fmt.Println("Transaction Server online at http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}