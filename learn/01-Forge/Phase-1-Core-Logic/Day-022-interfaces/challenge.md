# Anomaly Report: Day 022

## The Anomaly to Test
**Interface Satisfaction:** What happens if a struct implements the `Pay` method, but the signature is slightly different (e.g., uses `int64` instead of `int`)?

## Execution Steps
1. Modify your `CreditCard` Pay method to accept `float64`.
2. Try to pass it to `ProcessPayment(p Payer...)`.
3. Observe the compiler error.

## The Fintech Lesson
Strict interface compliance ensures that our "Engine" can trust every "Part" we plug into it. If the contract says `int`, the plugin must use `int`, or the bank's "Assembly Line" stops.