# Anomaly Report: Day 055

## The Anomaly to Test
**The Loading State:** What happens if the server takes 3 seconds to respond to the balance refresh?

## Execution Steps
1. Add `time.Sleep(3 * time.Second)` to the `/refresh-balance` handler.
2. Click the button. Notice the UI does nothing while waiting.
3. Add `hx-indicator` to the button and create a spinner div.

## The Fintech Lesson
Founders hate "silent" delays. If the ledger is syncing, Altradits must show a "Loading..." or "Syncing..." indicator. HTMX provides built-in classes to handle these transitions automatically, ensuring the user never wonders if the system has frozen.