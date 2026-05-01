# Anomaly Report: Day 027

## The Anomaly to Test
**The Silent Vanishing:** Launch a goroutine that is supposed to print something after 5 seconds, but let `main` exit after 1 second.

## Execution Steps
1. Write a goroutine with a long `time.Sleep`.
2. Keep the `main` function's execution time shorter than the goroutine's sleep.
3. Check the terminal output.

## The Fintech Lesson
If Altradits launches a "Save Transaction to Database" task in a goroutine, but the main program shuts down before it finishes, the money essentially "disappears" because the task was killed. We must learn to synchronize our goroutines.