# Anomaly Report: Day 068

## The Anomaly to Test
**The Tab Throttling:** What happens to the polling frequency when you switch to a different browser tab?

## Execution Steps
1. Open the Network tab in DevTools.
2. Observe the requests firing every 2s.
3. Switch to another tab for 30 seconds.
4. Switch back and look at the request log. 

## The Fintech Lesson
Modern browsers throttle timers in background tabs to save battery. In Altradits, this is actually a **feature**. If the Founder isn't looking at the dashboard, we don't need to waste CPU cycles polling the server. HTMX respects the browser's behavior, keeping the Forge efficient.