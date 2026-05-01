package main

import (
	"html/template"
	"net/http"
)

func main() {
	// Root/Vault View
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		render(w, r, "vault")
	})

	// Audit View
	http.HandleFunc("/audit", func(w http.ResponseWriter, r *http.Request) {
		render(w, r, "audit")
	})

	// Settings View
	http.HandleFunc("/settings", func(w http.ResponseWriter, r *http.Request) {
		render(w, r, "settings")
	})

	http.ListenAndServe(":8080", nil)
}

func render(w http.ResponseWriter, r *http.Request, activeTab string) {
	// If the request has the HTMX header, send ONLY the fragment
	if r.Header.Get("HX-Request") == "true" {
		tmpl := template.Must(template.ParseFiles("tabs.html"))
		tmpl.ExecuteTemplate(w, activeTab, nil)
		return
	}
	// Otherwise, send the full page shell
	tmpl := template.Must(template.ParseFiles("index.html", "tabs.html"))
	tmpl.Execute(w, activeTab)
}