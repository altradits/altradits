# Anomaly Report: Day 041

## The Anomaly to Test
**The Recursive Wall:** How much slower does the benchmark get if you increase Fibonacci(20) to Fibonacci(40)?

## Execution Steps
1. Create a second benchmark function for Fibonacci(40).
2. Run both and compare the `ns/op`.
3. Observe how the time increases exponentially, not linearly.

## The Fintech Lesson
Inefficient algorithms are "Performance Debt." If a core Altradits function is recursive and slow, a surge in users could lock up the CPU, causing the bank's processing to grind to a halt. We use benchmarks to find these bottlenecks before they reach production.