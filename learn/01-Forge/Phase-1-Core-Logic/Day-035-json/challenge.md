# Anomaly Report: Day 035

## The Anomaly to Test
**The Invisible Field:** What happens if you try to Marshal a struct with "unexported" (lowercase) fields?

## Execution Steps
1. Add a field `secretCode int` (lowercase) to your struct.
2. Assign it a value and Marshal the struct.
3. Check the resulting JSON string to see if `secretCode` appears.

## The Fintech Lesson
Go's JSON package can only see "Exported" (Uppercase) fields. If you keep your `internalBalance` lowercase, it won't be leaked in the API response. In Altradits, this is a built-in safety feature to prevent accidental data exposure.