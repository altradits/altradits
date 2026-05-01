# Anomaly Report: Day 089

## The Anomaly to Test
**The Zombie Goroutine:** When the timeout triggers in `main.go`, what happens to the `SlowAPI` goroutine that is still sleeping?

## Execution Steps
1. Add a `fmt.Println("SlowAPI is finishing...")` at the end of the `SlowAPI` function.
2. Run the program.
3. Observe that even though the `main` function timed out and moved on, the goroutine eventually finishes in the background—but nobody is listening to its channel anymore.

## The Systems Lesson
In Altradits, "Abandoned" goroutines lead to memory leaks. To fix this, we use the **Context** package (Day 090) to actively "cancel" background work the moment a timeout occurs, ensuring we don't waste CPU cycles on results we no longer want.

# Run the simulation
go run 05-Architecture/Day-089-select-timeouts/main.go

git add 05-Architecture/Day-089-select-timeouts/
git commit -m "feat(arch): implement select statement with timeout patterns for service resilience"
