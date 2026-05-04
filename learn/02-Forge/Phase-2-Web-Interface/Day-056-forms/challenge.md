# Anomaly Report: Day 056

## The Anomaly to Test
**The Double Submit:** What happens if the Founder clicks the "Execute" button five times rapidly while the server is processing?

## Execution Steps
1. Add `time.Sleep(2 * time.Second)` to your `/transact` handler.
2. Rapidly click the button.
3. Observe how multiple requests are sent.
4. Research `hx-disabled-elt` to prevent double-spending in Altradits.

## The Fintech Lesson
In Altradits, a double submit is a double withdrawal. We must use HTMX to disable the button as soon as it's clicked. This ensures "Transaction Integrity" at the UI level before the request even reaches our Go Mutexes.