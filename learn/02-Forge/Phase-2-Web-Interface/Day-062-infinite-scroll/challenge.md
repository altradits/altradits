# Anomaly Report: Day 062

## The Anomaly to Test
**The Bottomless Pit:** What happens if the user scrolls so fast that they trigger 5 "load-more" requests at the same time?

## Execution Steps
1. Add a `time.Sleep(1 * time.Second)` to `/load-more`.
2. Scroll to the bottom and quickly scroll up and down.
3. Observe if duplicate rows appear.
4. Research `hx-indicator` to show a "Loading more..." row while the server thinks.

## The Fintech Lesson
Infinite scroll is elegant, but it can be a "DDoS" on your own database if not throttled. In Altradits, we ensure that only one "revealed" trigger is active at a time to keep the ledger consistent and the server calm.