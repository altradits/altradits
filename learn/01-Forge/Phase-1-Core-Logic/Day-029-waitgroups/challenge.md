# Anomaly Report: Day 029

## The Anomaly to Test
**The Negative Counter:** What happens if you call `wg.Done()` more times than you called `wg.Add()`?

## Execution Steps
1. Initialize a WaitGroup.
2. Call `wg.Add(1)`.
3. Call `wg.Done()` twice.
4. Observe the program's reaction.

## The Fintech Lesson
Panic! If the WaitGroup counter goes below zero, the program crashes immediately. In Altradits, our synchronization must be mathematically perfect, or the "engine" explodes.