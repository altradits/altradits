func main() {
	mux := http.NewServeMux()
	limiter := NewIPLimiter()

	mux.HandleFunc("/api/secure-data", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Sensitive Forge Data Accessed."))
	})

	// Wrap our API with the rate limiter
	protectedHandler := LimitMiddleware(limiter, mux)

	fmt.Println("🛡️  Rate Limiter Active on :8080")
	http.ListenAndServe(":8080", protectedHandler)
}