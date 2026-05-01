# Anomaly Report: Day 034

## The Anomaly to Test
**Context Leak:** What happens if you create a context but never call the `cancel()` function?

## Execution Steps
1. Create a context with `context.WithCancel`.
2. Do NOT call the returned `cancel` function.
3. Run the code and check for memory/resource warnings (or use `go vet`).

## The Fintech Lesson
Failing to call `cancel()` keeps the context and its children alive in memory until the timeout or parent finishes. For a bank processing millions of requests, this results in a slow death by RAM exhaustion. Always `defer cancel()`.