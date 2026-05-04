# Anomaly Report: Day 051

## The Anomaly to Test
**Middleware Order:** Does it matter what order you call `r.Use()`?

## Execution Steps
1. Create Middleware A (prints "Entering A") and Middleware B (prints "Entering B").
2. Register them: `r.Use(A)` then `r.Use(B)`.
3. Swap the order and observe the log output.

## The Fintech Lesson
Middleware execution is a stack. If you put "Authentication" *after* "Rate Limiting," you save your database from checking passwords for bots. If you put "Logging" *last*, you might not capture errors from earlier layers. In Altradits, order is the difference between a secure audit and a blind spot.