# Anomaly Report: Day 006

## The Anomaly to Test
**Floating Point Precision Loss:** Can 0.1 + 0.2 actually equal something other than 0.3?

## Execution Steps
1. Create a variable `sum := 0.1 + 0.2`.
2. Print the result using `fmt.Printf("%.20f\n", sum)`.
3. Compare the output to exactly 0.3.

## The Fintech Lesson
If the computer shows 0.30000000000000004, and we multiply that by a billion transactions, where does the "extra" money come from? This is why Altradits will eventually migrate to fixed-point integers.