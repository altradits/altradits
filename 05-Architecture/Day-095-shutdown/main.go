package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/long-task", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second) // Simulate a heavy ledger update
		w.Write([]byte("Task Finished Safely"))
	})

	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	// 1. Run server in a goroutine so it doesn't block
	go func() {
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server ListenAndServe: %v", err)
		}
	}()

	// 2. Wait for interrupt signal
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop // Block here until we get a signal

	log.Println("Shutting down Forge...")

	// 3. Create a deadline for the shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Forge forced to shutdown: %v", err)
	}

	log.Println("Forge exited cleanly.")
}