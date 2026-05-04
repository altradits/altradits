# Anomaly Report: Day 057

## The Anomaly to Test
**The Race Condition:** What happens if the user types "S", then "St", but the response for "S" arrives *after* the response for "St"?

## Execution Steps
1. Simulate network jitter by adding random `time.Sleep` to the `/search` route.
2. Type quickly.
3. Observe if the results "flicker" back to an older search state.
4. Research how `hx-sync` can ensure the most recent request always wins.

## The Fintech Lesson
Data consistency is paramount. If the Founder is searching for a high-risk transaction, they must see the most accurate, up-to-date filter results. In Altradits, we use `hx-sync="this:replace"` to abort old requests and ensure the UI reflects the current input.