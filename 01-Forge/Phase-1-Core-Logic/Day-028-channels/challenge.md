# Anomaly Report: Day 028

## The Anomaly to Test
**The Deadlock:** What happens if the main goroutine tries to receive from a channel, but no other goroutine is sending data?

## Execution Steps
1. Create a channel.
2. Attempt to receive `<-ch` in `main`.
3. Do NOT launch any other goroutines.
4. Run the code.

## The Fintech Lesson
Deadlock! The program freezes forever because it is waiting for money that will never arrive. In Altradits, we must ensure every "Receiver" has a "Sender," or our system will hang indefinitely.