package handlers

import (
	"html/template"
	"net/http"
	"time"

	"github.com/altradits/altradits/internal/db"
	"github.com/altradits/altradits/internal/middleware"
	"github.com/altradits/altradits/internal/utils"
)

func HandleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	u := middleware.GetUser(r)
	if u != nil {
		redirectByRole(w, r, u.Role)
		return
	}
	serveTemplate(w, r, "web/templates/home.html", nil)
}

func HandleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		serveTemplate(w, r, "web/templates/register.html", nil)
		return
	}

	identifier := r.FormValue("identifier")
	password := r.FormValue("password")

	if !utils.ValidateIdentifier(identifier) {
		serveTemplateWithError(w, r, "web/templates/register.html", "Enter a valid email or phone number.")
		return
	}
	if len(password) < 6 {
		serveTemplateWithError(w, r, "web/templates/register.html", "Password must be at least 6 characters.")
		return
	}

	hash := utils.HashPassword(password)
	var userID string
	err := db.DB.QueryRow(
		`INSERT INTO users (identifier, password, role) VALUES ($1, $2, 'customer') RETURNING id`,
		identifier, hash).Scan(&userID)
	if err != nil {
		serveTemplateWithError(w, r, "web/templates/register.html", "Account already exists. Try logging in.")
		return
	}

	// Create wallet
	lightningAddr := identifier + "@altradits.com"
	db.DB.Exec(`INSERT INTO wallets (user_id, lightning_addr) VALUES ($1, $2)`, userID, lightningAddr)

	// Create session
	setSession(w, userID)
	http.Redirect(w, r, "/customer/dashboard", http.StatusSeeOther)
}

func HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		serveTemplate(w, r, "web/templates/login.html", nil)
		return
	}

	identifier := r.FormValue("identifier")
	password := r.FormValue("password")
	hash := utils.HashPassword(password)

	var userID, role string
	var isBlocked bool
	err := db.DB.QueryRow(
		`SELECT id, role, is_blocked FROM users WHERE identifier=$1 AND password=$2`,
		identifier, hash).Scan(&userID, &role, &isBlocked)
	if err != nil {
		serveTemplateWithError(w, r, "web/templates/login.html", "Invalid email/phone or password.")
		return
	}
	if isBlocked {
		serveTemplateWithError(w, r, "web/templates/login.html", "This account has been suspended.")
		return
	}

	setSession(w, userID)
	redirectByRole(w, r, role)
}

func HandleLogout(w http.ResponseWriter, r *http.Request) {
	c, err := r.Cookie("altradits_session")
	if err == nil {
		db.DB.Exec("DELETE FROM sessions WHERE token = $1", c.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:    "altradits_session",
		Value:   "",
		Expires: time.Unix(0, 0),
		Path:    "/",
	})
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func setSession(w http.ResponseWriter, userID string) {
	token, _ := utils.GenerateToken()
	expiry := utils.SessionExpiry()
	db.DB.Exec(`INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)`,
		userID, token, expiry)
	http.SetCookie(w, &http.Cookie{
		Name:     "altradits_session",
		Value:    token,
		Expires:  expiry,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func redirectByRole(w http.ResponseWriter, r *http.Request, role string) {
	switch role {
	case "admin":
		http.Redirect(w, r, "/admin/dashboard", http.StatusSeeOther)
	case "trader":
		http.Redirect(w, r, "/trader/dashboard", http.StatusSeeOther)
	default:
		http.Redirect(w, r, "/customer/dashboard", http.StatusSeeOther)
	}
}

// Template helpers

func serveTemplate(w http.ResponseWriter, r *http.Request, path string, data interface{}) {
	tmpl, err := template.ParseFiles("web/templates/layout.html", path)
	if err != nil {
		http.Error(w, "Template error: "+err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := tmpl.ExecuteTemplate(w, "layout", data); err != nil {
		http.Error(w, err.Error(), 500)
	}
}

func serveTemplateWithError(w http.ResponseWriter, r *http.Request, path, errMsg string) {
	tmpl, err := template.ParseFiles("web/templates/layout.html", path)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl.ExecuteTemplate(w, "layout", map[string]interface{}{"Error": errMsg})
}

func serveTemplateData(w http.ResponseWriter, r *http.Request, path string, data interface{}) {
	u := middleware.GetUser(r)
	wrapped := map[string]interface{}{
		"User": u,
		"Data": data,
	}
	serveTemplate(w, r, path, wrapped)
}
