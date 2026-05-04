# Anomaly Report: Day 047

## The Anomaly to Test
**Struct Packing:** Compare the size of two structs with identical fields but different orders.

## Execution Steps
1. Define `StructA { a bool, b int64, c bool }`.
2. Define `StructB { b int64, a bool, c bool }`.
3. Print `unsafe.Sizeof` for both.

## The Fintech Lesson
Go adds "Padding" bytes to align data with memory boundaries. By grouping smaller types (like bools) together, Altradits can "pack" its data more tightly. This reduces cache misses and speeds up our financial calculations.