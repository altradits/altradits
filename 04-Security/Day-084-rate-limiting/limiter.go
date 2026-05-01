package main

import (
	"net/http"
	"sync"
	"golang.org/x/time/rate"
)

// IPLimiter manages a unique bucket for every IP address
type IPLimiter struct {
	ips map[string]*rate.Limiter
	mu  sync.Mutex
}

func NewIPLimiter() *IPLimiter {
	return &IPLimiter{
		ips: make(map[string]*rate.Limiter),
	}
}

func (i *IPLimiter) GetLimiter(ip string) *rate.Limiter {
	i.mu.Lock()
	defer i.mu.Unlock()

	limiter, exists := i.ips[ip]
	if !exists {
		// Allow 5 requests per second, with a "burst" capacity of 10
		limiter = rate.NewLimiter(5, 10)
		i.ips[ip] = limiter
	}

	return limiter
}

// LimitMiddleware rejects requests if the bucket is empty
func LimitMiddleware(l *IPLimiter, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr // In production, use X-Forwarded-For if behind a proxy
		
		if !l.GetLimiter(ip).Allow() {
			http.Error(w, "Too Many Requests: Cooling Down...", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}