package main

import (
	"html/template"
	"net/http"
	"log"
)

func main() {
	// Serve static files from the "static" directory
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html"))
		tmpl.Execute(w, nil)
	})

	log.Println("Tailwind Dashboard active at http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}