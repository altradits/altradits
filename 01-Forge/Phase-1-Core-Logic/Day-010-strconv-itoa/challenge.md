# Anomaly Report: Day 010

## The Anomaly to Test
**The Unicode Trap:** Test the difference between `strconv.Itoa(65)` and `string(65)`.

## Execution Steps
1. Create `res1 := strconv.Itoa(65)`.
2. Create `res2 := string(65)`.
3. Print both.

## The Fintech Lesson
`string(65)` returns "A" (the Unicode character for 65). In a bank, if you try to convert a balance to a string using the wrong method, you might accidentally turn a customer's money into random alphabet characters!