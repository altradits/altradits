# Anomaly Report: Day 004

## The Anomaly to Test
**Shadowing and Scope:** What happens if you declare a variable with the same name inside a function as one outside (package level)?

## Execution Steps
1. Create a package-level variable `var Balance = 100`.
2. Inside `main()`, use `Balance := 200`.
3. Print the balance. Update it. Print it again outside the local scope if possible.

## The Fintech Lesson
If an engineer "shadows" a global bank balance variable accidentally, could they be updating a "fake" local balance while the real vault remains unchanged?