# Anomaly Report: Day 040

## The Anomaly to Test
**The Regression:** What happens if you "break" the logic in `vault.go` (e.g., change 0.05 to 0.06) and run the tests?

## Execution Steps
1. Purposefully change the math in your main file.
2. Run `go test`.
3. Read the failure message.

## The Fintech Lesson
Tests are the "Shield" of Altradits. If an engineer makes a mistake that would result in the bank giving away too much interest, the test failure prevents that code from ever reaching the production server.