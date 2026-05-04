# Anomaly Report: Day 039

## The Anomaly to Test
**The Port Conflict:** What happens if you try to start your Go server on a port that is already being used by another application?

## Execution Steps
1. Start your server on port 8080.
2. Open a second terminal and try to run the same program again.
3. Observe the error message returned by `ListenAndServe`.

## The Fintech Lesson
Ports are exclusive resources. If the Altradits server fails to bind to its port, the bank is offline. We must always check the error returned by `ListenAndServe` and log it immediately to alert the devops team.