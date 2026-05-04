package main

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

// TASK:
// 1. Create a "RequestLogger" middleware that prints the method, URL, and time taken.
// 2. Create a "SecurityHeader" middleware that adds "X-Altradits-Shield: Active" to all responses.
// 3. Use Chi's r.Use() to apply them globally.
// 4. Create a protected route "/admin" that uses both middlewares.

func RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("[%s] %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func main() {
	r := chi.NewRouter()

	r.Use(RequestLogger)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Welcome to Altradits Web Engine"))
	})

	fmt.Println("Server starting on :8080...")
	http.ListenAndServe(":8080", r)
}