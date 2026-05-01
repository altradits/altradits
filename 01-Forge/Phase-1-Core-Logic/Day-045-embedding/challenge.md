# Anomaly Report: Day 045

## The Anomaly to Test
**Shadowed Methods:** If `User` has a method `LogInfo()` and `BusinessAccount` also has a method `LogInfo()`, which one runs when you call `biz.LogInfo()`?

## Execution Steps
1. Define a method for both structs with the same name.
2. Call the method from the outer struct.
3. Access the inner struct's version explicitly using `biz.User.LogInfo()`.

## The Fintech Lesson
Embedding allows for "Overriding" behavior. In Altradits, a `SavingsAccount` might embed a `BaseAccount` but "Shadow" the `Withdraw` method to add extra logic for interest penalties. Understanding this hierarchy ensures the correct logic triggers every time.