# Anomaly Report: Day 024

## The Anomaly to Test
**Error Type vs Value:** Can you create a custom struct that implements the `error` interface?

## Execution Steps
1. Create a struct `type BankError struct { Code int, Msg string }`.
2. Add a method `func (e BankError) Error() string`.
3. Use `errors.As` to extract the `Code` from the error in `main`.

## The Fintech Lesson
Custom error structs allow Altradits to attach "Metadata" (like Error Codes or Timestamps) to an error. This is how we distinguish between a "User Mistake" (Code 400) and a "System Crash" (Code 500).