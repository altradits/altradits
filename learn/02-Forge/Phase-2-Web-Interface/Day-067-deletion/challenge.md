# Anomaly Report: Day 067

## The Anomaly to Test
**The Accidental Purge:** How do we prevent a Founder from accidentally deleting a critical security log with one misclick?

## Execution Steps
1. Add the `hx-confirm="Are you sure you want to purge this log entry?"` attribute to the delete button.
2. Click the delete icon.
3. Observe how HTMX intercepts the request and waits for native browser confirmation.

## The Fintech Lesson
Irreversible actions must have a "Speed Bump." In Altradits, we use `hx-confirm` for low-risk deletions and custom Modals (Day 059) for high-risk vault operations. Never let a single click destroy data without a second thought.