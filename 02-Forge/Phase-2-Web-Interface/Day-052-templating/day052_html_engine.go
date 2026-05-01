package main

import (
	"html/template"
	"net/http"
)

type PageData struct {
	Title   string
	Balance int
}

func main() {
	// TASK:
	// 1. Parse the 'index.html' file using template.ParseFiles.
	// 2. Create a handler that passes a 'PageData' struct to the template.
	// 3. Use 'tmpl.Execute' to render the data into the browser.
}