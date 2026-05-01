# Anomaly Report: Day 008

## The Anomaly to Test
**Predictability:** Can we guess the next "random" number?

## Execution Steps
1. Remove the `rand.Seed` line from your code.
2. Run the program 5 times in a row.
3. Observe if the CVV generated is the same every single time.

## The Fintech Lesson
If an attacker knows your seed (like the system clock or a constant), they can predict every "Random" ID your bank ever generates. For Altradits, security depends on true entropy.