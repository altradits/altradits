package main

import (
	"html/template"
	"net/http"
	"time"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, nil)
	})

	// Delayed endpoint to test Optimistic vs. Pessimistic
	http.HandleFunc("/set-tag", func(w http.ResponseWriter, r *http.Request) {
		tag := r.FormValue("tag")
		time.Sleep(1500 * time.Millisecond) // Simulate network/DB lag

		tmpl := template.Must(template.ParseFiles("tag_response.html"))
		tmpl.Execute(w, tag)
	})

	http.ListenAndServe(":8080", nil)
}