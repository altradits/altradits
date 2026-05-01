package main

import (
	"log/slog"
	"os"
)

func InitLogger() *slog.Logger {
	// JSON handler makes logs machine-readable
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	
	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}