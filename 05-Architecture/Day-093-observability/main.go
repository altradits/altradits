func main() {
	logger := InitLogger()

	// Simulate a transaction process
	transactionID := "tx-8821"
	founderID := "stan-01"

	// Create a sub-logger that automatically attaches these IDs to every log entry
	txLog := logger.With(
		slog.String("tx_id", transactionID),
		slog.String("founder_id", founderID),
	)

	txLog.Info("Starting vault settlement")
	
	// Simulate an error
	if err := mockProcess(); err != nil {
		txLog.Error("Settlement failed", 
			slog.String("error", err.Error()),
			slog.Duration("latency", 142*time.Millisecond),
		)
	}
}