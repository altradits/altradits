# Anomaly Report: Day 044

## The Anomaly to Test
**The MustCompile Panic:** What happens if you pass a "Broken" regex pattern (e.g., `[A-Z(` missing a bracket) to `regexp.MustCompile`?

## Execution Steps
1. Intentionally write an invalid regex pattern.
2. Use `regexp.MustCompile` on it.
3. Run the code.

## The Fintech Lesson
`MustCompile` panics on failure. It is intended for use at the package level so the program crashes *immediately* if the regex is wrong, rather than failing silently later. In Altradits, we prefer "Fail Fast" over "Process Garbage."