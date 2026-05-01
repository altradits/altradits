# Anomaly Report: Day 015

## The Anomaly to Test
**The Append Reallocation:** Does `append` modify the original slice or return a new one?

## Execution Steps
1. Create a slice `a`.
2. Call `append(a, 10)` but do NOT assign it back to `a` (i.e., don't do `a = append...`).
3. Print `a` and see if the 10 was added.

## The Fintech Lesson
`append` may allocate a new memory block. If we forget to re-assign the result (`a = append(a, x)`), the transaction is lost in memory. In Altradits, missing an assignment means a lost deposit.