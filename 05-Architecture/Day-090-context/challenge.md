# Anomaly Report: Day 090

## The Anomaly to Test
**The Context Value Trap:** You can also use context to pass data, like `context.WithValue(ctx, "user_id", 123)`. Is this a good place to store optional parameters for a function?

## Execution Steps
1. Research "Go Context Best Practices."
2. Find the section on "Context Values."
3. Observe why the Go community discourages using Context for function arguments and instead suggests using it only for "Request-scoped data" (like Trace IDs or Auth tokens).

## The Systems Lesson
In Altradits, Context is a **Signal Wire**, not a data bucket. We use it to tell the system "how" to run (how long, when to stop), not "what" to process. By keeping our Contexts clean, we ensure our code remains readable and our Goroutines remain obedient.



# Run the graceful shutdown simulation
go run 05-Architecture/Day-090-context/main.go

git add 05-Architecture/Day-090-context/
git commit -m "feat(arch): implement context propagation for graceful goroutine cancellation"