# Anomaly Report: Day 087

## The Anomaly to Test
**The Resource Exhaustion:** What happens if you try to run 1,000,000 Goroutines at once?

## Execution Steps
1. Change `txCount` to `1000000`.
2. Remove the `fmt.Printf` inside the loop (to avoid slowing down with I/O).
3. Run the program and watch your Activity Monitor/Task Manager.

## The Systems Lesson
Goroutines are cheap, but they aren't free. Each one starts with a few KB of memory. While Go can handle millions, eventually you will hit the limits of your RAM or open file descriptors. In Altradits, we use **Worker Pools** (Day 088) to cap the number of active Goroutines and keep the engine stable.