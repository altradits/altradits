# Anomaly Report: Day 053

## The Anomaly to Test
**The Context Disappearance:** What happens if you call `{{ template "balance" }}` *without* the dot at the end?

## Execution Steps
1. Remove the `.` from the template call in `layout.html`.
2. Run the server and check the balance display.
3. Observe if the numbers appear or if the area is blank.

## The Fintech Lesson
In Go, templates are isolated. If you don't explicitly "pass the torch" (the dot), the sub-template has no access to the vault data. In Altradits, this is a common bug when building complex dashboards. Always remember to pass your context.