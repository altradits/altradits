package main

import (
	"html/template"
	"net/http"
)

type Contact struct {
	ID    string
	Name  string
	Email string
}

var founderContacts = map[string]*Contact{
	"1": {"1", "Stan", "stan@altradits.io"},
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("index.html", "row.html"))
		tmpl.ExecuteTemplate(w, "index.html", founderContacts["1"])
	})

	// GET /contact/1/edit -> Returns the Form fragment
	http.HandleFunc("/contact/1/edit", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.ParseFiles("edit.html"))
		tmpl.Execute(w, founderContacts["1"])
	})

	// PUT /contact/1 -> Updates data and returns the Row fragment
	http.HandleFunc("/contact/1", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPut {
			founderContacts["1"].Name = r.PostFormValue("name")
			founderContacts["1"].Email = r.PostFormValue("email")
		}
		tmpl := template.Must(template.ParseFiles("row.html"))
		tmpl.Execute(w, founderContacts["1"])
	})

	http.ListenAndServe(":8080", nil)
}