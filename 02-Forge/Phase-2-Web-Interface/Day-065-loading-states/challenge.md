# Anomaly Report: Day 065

## The Anomaly to Test
**The Premature Click:** If the user clicks the "Start Audit" button while an audit is *already* running, how does the system react?

## Execution Steps
1. Rapidly click the button twice.
2. Observe the terminal logs. Does the server start two audits?
3. Research the `hx-disabled-elt="this"` attribute to freeze the button during the request.

## The Fintech Lesson
Resources are expensive. If a Founder triggers a heavy audit 10 times, they could potentially crash the system. We use indicators for **Feedback** and `hx-disabled` for **Control**.