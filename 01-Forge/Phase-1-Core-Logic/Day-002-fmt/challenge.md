# Anomaly Report: Day 002

## The Anomaly to Test
**Precision Drift Simulation:** What happens when we use the "Width and Precision" flags in Printf?

## Execution Steps
1. Attempt to force a whole number to show two decimal places using Printf formatting.
2. Observe if the value is rounded or truncated by the formatter.

## The Fintech Lesson
If a display formatter rounds a number up, but the internal ledger stays down, how does this create a "Trust Gap" with the customer?