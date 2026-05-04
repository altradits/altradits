# Anomaly Report: Day 033

## The Anomaly to Test
**The Zombie Ticker:** Does stopping a ticker also close the channel `ticker.C`?

## Execution Steps
1. Create a ticker.
2. Stop the ticker.
3. Attempt to read from `<-ticker.C` after stopping it.
4. Observe if the program deadlocks or receives a final value.

## The Fintech Lesson
Stopping a ticker does NOT close its channel. It just stops the ticks from being sent. In Altradits, if we stop a service but keep a goroutine waiting for a tick, that goroutine stays alive forever (a memory leak). We must manually signal the goroutine to exit.