# Anomaly Report: Day 030

## The Anomaly to Test
**The Data Race:** What happens to the final balance if you remove the Mutex `Lock` and `Unlock` calls?

## Execution Steps
1. Comment out the Mutex code.
2. Run the program with 1000 concurrent deposits.
3. Use the command: `go run -race day030_atomic_vault.go`.

## The Fintech Lesson
Without a Mutex, two goroutines might read "Balance = 0" at the same time, both add 1, and both write "Balance = 1" back—losing one cent in the process. In Altradits, a Race Condition is a high-speed bank robbery committed by the code itself.