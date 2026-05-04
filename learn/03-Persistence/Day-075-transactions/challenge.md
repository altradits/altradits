# Anomaly Report: Day 075

## The Anomaly to Test
**The Partial Failure:** What happens if the Sender has enough money, but the Receiver's account ID is invalid?

## Execution Steps
1. Call `TransferTx` with a valid Sender but a non-existent Receiver UUID.
2. Observe the error returned by the second update.
3. Check the database. Did the Sender's balance decrease? (It should NOT).

## The Fintech Lesson
In Altradits, "Close enough" isn't an option. We use transactions to enforce **Consistency**. If the entire chain of events—from withdrawal to deposit to logging—isn't perfect, we revert the universe to its previous state. This is how we maintain the "Speed of Trust."