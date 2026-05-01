# Anomaly Report: Day 046

## The Anomaly to Test
**The Setter Trap:** Can you use reflection to change the value of a variable?

## Execution Steps
1. Create `v := reflect.ValueOf(amount)`.
2. Try to call `v.SetInt(1000)`.
3. Observe the crash (panic).
4. Research why you must pass a **pointer** to `ValueOf` to make a variable settable.

## The Fintech Lesson
Reflection allows us to bypass some of Go's strict rules, but it's dangerous. If we use reflection to modify account balances, we lose the safety of the compiler. In Altradits, reflection is a "Scalpel"—it's for building generic libraries, not for daily business logic.