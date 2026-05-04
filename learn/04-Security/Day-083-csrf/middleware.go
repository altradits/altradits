package main

import (
	"net/http"
	"github.com/justinas/nosurf"
)

// CSRFHandler wraps our application with token verification logic
func CSRFHandler(next http.Handler) http.Handler {
	csrfHandler := nosurf.New(next)

	// Set cookie options for maximum security
	csrfHandler.SetBaseCookie(http.Cookie{
		HttpOnly: true,
		Path:     "/",
		Secure:   true, // Only sent over HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	return csrfHandler
}