# Anomaly Report: Day 017

## The Anomaly to Test
**The Missing Key:** What does Go return if you ask for a key that does not exist in the map?

## Execution Steps
1. Create a map with one entry: `m["Stan"] = 100`.
2. Attempt to print `m["Hacker"]`.
3. Check if the program crashes or returns a default value.

## The Fintech Lesson
Go returns the "Zero Value" of the value type (0 for int). If we don't use the `value, ok := m[key]` check, Altradits might tell a user their balance is $0 just because their ID was typed incorrectly, rather than saying "Account Not Found."