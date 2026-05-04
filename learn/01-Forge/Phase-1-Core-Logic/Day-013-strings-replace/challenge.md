# Anomaly Report: Day 013

## The Anomaly to Test
**Selective Removal:** If you use `strings.Replace` with `n=1`, and the string is "$50$50", does it remove the first, the last, or both?

## Execution Steps
1. Create a string with duplicate symbols.
2. Run `Replace` with different `n` values (1, 2, -1).
3. Observe the outcome.

## The Fintech Lesson
If a user accidentally types two decimal points (e.g., "10.50.2"), and our "cleaner" only replaces the first one, we might still have a malformed number that crashes our `strconv.Atoi` gate.