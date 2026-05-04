# Anomaly Report: Day 026

## The Anomaly to Test
**The Selective Recovery:** Can we recover from a panic and then decide to re-panic?

## Execution Steps
1. In the deferred recovery block, check the value returned by `recover()`.
2. If the value is a specific "Fatal" string, call `panic()` again.
3. Observe how the program behaves.

## The Fintech Lesson
Not all panics are equal. If our server is out of memory (OOM), "recovering" might just lead to corrupted data. Sometimes, the safest thing for a bank is to stay dead until an engineer intervenes.