# Anomaly Report: Day 031

## The Anomaly to Test
**The Default Block:** What happens if you add a `default:` case to a select statement that is waiting for a slow channel?

## Execution Steps
1. Create a select waiting for a channel.
2. Add a `default:` case that prints "No data yet".
3. Run the program.

## The Fintech Lesson
A `default` case makes a `select` non-blocking. Instead of waiting for the transaction to complete, the code will hit the default and move on immediately. In Altradits, this is useful for "Polling" but dangerous for "Processing" because we might skip a critical update.