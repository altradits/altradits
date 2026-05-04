# Anomaly Report: Day 007

## The Anomaly to Test
**Division by Zero:** What happens to the Altradits engine if a modulus or division operation uses 0 as the divisor?

## Execution Steps
1. Create a variable `check := 10 % 0` or `result := 10 / 0`.
2. Attempt to compile the code.
3. Attempt to run the code if it compiled.

## The Fintech Lesson
Panic! A division by zero is one of the few things that can instantly kill a Go program. In Altradits, we must "Sanitize" every divisor to ensure it is > 0 before the math happens.