# Anomaly Report: Day 059

## The Anomaly to Test
**The ESC Key Escape:** Standard modals should close when the user presses the 'Escape' key.

## Execution Steps
1. Add a global listener to the `modal.html` fragment using HTMX's `hx-trigger="keyup[key=='Escape'] from:body"`.
2. Configure the trigger to remove the modal from the DOM.
3. Test by opening the modal and hitting ESC.

## The Fintech Lesson
UX is a form of security. If a Founder feels "trapped" in a modal because they can't close it easily, they might panic or refresh the page, potentially interrupting a transaction in progress. We ensure "Graceful Exits" for every UI interaction.