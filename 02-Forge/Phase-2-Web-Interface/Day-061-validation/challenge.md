# Anomaly Report: Day 061

## The Anomaly to Test
**The Server-Side Override:** If the user bypasses the UI and sends a direct request to the registration endpoint with invalid data, what happens?

## Execution Steps
1. Add a final registration endpoint `/register`.
2. Notice that while the UI disables the button, a tool like `curl` could still hit `/register`.
3. Ensure you duplicate your validation logic in the final submission handler.

## The Fintech Lesson
UI validation is for **UX** (User Experience). Server validation is for **Security**. Altradits uses both. Never trust the browser—the browser is a liar. The Go server is the only source of truth.