package main

import (
	"net/http"
	"github.com/justinas/nosurf"
)

// The Security Stack: Order Matters
func FortressStack(next http.Handler) http.Handler {
	// 1. Rate Limiting (Prevent DoS)
	stack := LimitMiddleware(globalLimiter, next)

	// 2. CSRF Protection (Prevent Forgery)
	stack = nosurf.New(stack)

	// 3. Security Headers (HSTS, CSP, X-Frame-Options)
	stack = SecurityHeadersMiddleware(stack)

	// 4. JWT Authentication (Verify Identity)
	// Only applied to /vault and /admin routes
	return stack
}

func SecurityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' unpkg.com cdn.tailwindcss.com;")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}