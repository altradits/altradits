# Anomaly Report: Day 019

## The Anomaly to Test
**Struct Comparison:** Can you compare two struct instances using `==`?

## Execution Steps
1. Create two accounts with identical field values: `acc1` and `acc2`.
2. Compare them: `fmt.Println(acc1 == acc2)`.
3. Change one field in `acc2` and compare again.

## The Fintech Lesson
Go allows direct comparison of structs if all their fields are "comparable." This is vital for Altradits when we need to check if a backup record exactly matches a live record during a security audit.
