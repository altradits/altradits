# Anomaly Report: Day 032

## The Anomaly to Test
**The Post-Mortem Send:** What happens if a goroutine attempts to send money into a channel that is already closed?

## Execution Steps
1. Close a channel.
2. Attempt `ch <- 100`.
3. Observe the result.

## The Fintech Lesson
Sending to a closed channel causes a panic. In Altradits, this represents a "Broken Pipe" in the ledger. We must ensure our senders always know the status of the channel before attempting a transfer.