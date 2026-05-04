# Anomaly Report: Day 020

## The Anomaly to Test
**The Ghost Update:** Try to update the balance using a "Value Receiver" instead of a "Pointer Receiver."

## Execution Steps
1. Define `func (a Account) Update(val int64) { a.Balance += val }`.
2. Call it in `main`.
3. Print the balance after the call.

## The Fintech Lesson
If you use a Value Receiver, Go creates a **copy** of the account. You update the copy, then the copy is deleted, and the customer's real money remains unchanged. In Altradits, using the wrong receiver type results in a "Silent Logic Failure."