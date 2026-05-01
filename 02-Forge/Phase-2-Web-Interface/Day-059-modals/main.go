package main

import (
	"html/template"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, nil)
	})

	// Endpoint to serve the Modal Fragment
	http.HandleFunc("/confirm-transfer", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("modal.html"))
		tmpl.Execute(w, nil)
	})

	http.ListenAndServe(":8080", nil)
}