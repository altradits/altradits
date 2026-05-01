# Anomaly Report: Day 023

## The Anomaly to Test
**The Shadow Error:** What happens if you declare a variable named `err` in an inner scope when it already exists in the outer scope?

## Execution Steps
1. Call a function that returns an error.
2. Inside an `if` block, call another function and use `err := ...` (short declaration).
3. Try to check the "outer" error after the `if` block.

## The Fintech Lesson
"Variable Shadowing" can make you think you handled an error when you actually only handled a local version of it. In Altradits, this could lead to a "Success" message being sent for a "Failed" transaction.