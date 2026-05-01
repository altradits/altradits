# Anomaly Report: Day 052

## The Anomaly to Test
**The Logic Separation:** What happens if you try to perform a calculation inside the template? (e.g., `{{ .Balance * 0.05 }}`)

## Execution Steps
1. Attempt to multiply the balance by an interest rate directly in the HTML.
2. Observe the error.
3. Fix it by adding a method `func (d Dashboard) GetInterest() float64` to the struct in `main.go` and calling `{{ .GetInterest }}` in the HTML.

## The Fintech Lesson
Go templates do not allow arbitrary logic; they only allow data display and method calls. This is a "Guardrail" that prevents Altradits from having messy, un-testable business logic inside the UI layer.