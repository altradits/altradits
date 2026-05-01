// DANGEROUS: Bypasses auto-escaping
func UnsafeHandler(w http.ResponseWriter, r *http.Request) {
    userInput := r.FormValue("bio")
    // If userInput is a script, it executes in the Founder's browser!
    tmpl := template.Must(template.New("vulnerable").Parse("<div>{{ . }}</div>"))
    tmpl.Execute(w, template.HTML(userInput)) 
}

// SAFE: Use a library like Bluemonday to "wash" the HTML first
func SafeHandler(w http.ResponseWriter, r *http.Request) {
    userInput := r.FormValue("bio")
    p := bluemonday.UGCPolicy() // Only allows safe tags like <b>, <i>, <a>
    sanitized := p.Sanitize(userInput)
    
    tmpl := template.Must(template.New("safe").Parse("<div>{{ . }}</div>"))
    tmpl.Execute(w, template.HTML(sanitized))
}