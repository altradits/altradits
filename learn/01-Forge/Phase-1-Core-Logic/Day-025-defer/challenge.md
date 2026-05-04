# Anomaly Report: Day 025

## The Anomaly to Test
**The Defer Argument Snapshot:** When are the arguments for a deferred function evaluated—at the time the defer is called, or when the function actually executes?

## Execution Steps
1. Create a variable `x := 10`.
2. `defer fmt.Println(x)`.
3. Change `x` to 20.
4. Observe the output.

## The Fintech Lesson
If we defer a log of a "Final Balance," we must be careful. If the balance is passed as an argument to the defer, it captures the value *at that moment*, not the value after the transaction. Altradits must ensure audit logs reflect the final truth.