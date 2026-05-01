# Anomaly Report: Day 052

## The Anomaly to Test
**The Logic Leak:** Can you call a method of a struct directly inside the HTML template?

## Execution Steps
1. Add a method to your `PageData` struct: `func (p PageData) IsWealthy() bool { return p.Balance > 1000 }`.
2. Inside `index.html`, use an `{{if .IsWealthy}}` block to display a "VIP" badge.
3. Observe how logic moves from the `.go` file into the `.html` file.

## The Fintech Lesson
While Go templates allow you to call methods, we must be careful. If we put too much "Business Logic" (like interest calculations) in the HTML, the system becomes hard to audit. In Altradits, we keep the *Calculations* in the Go Engine and use the *Templates* only to decide what the user sees.