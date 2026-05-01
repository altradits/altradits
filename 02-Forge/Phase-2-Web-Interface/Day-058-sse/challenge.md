# Anomaly Report: Day 058

## The Anomaly to Test
**The Resource Leak:** What happens to your Go server if 100 Founders open the dashboard, but then close their browser tabs?

## Execution Steps
1. Add a `log.Println("New Connection")` at the start of `/events`.
2. Add a `log.Println("Connection Closed")` using `r.Context().Done()`.
3. Open and close several tabs.
4. Observe if your `for` loop continues to run in the background for closed connections.

## The Fintech Lesson
Zombies eat RAM. If Altradits keeps calculating balances for closed connections, the server will eventually crash. We must always use `select { case <-r.Context().Done(): return ... }` to kill the loop when the Founder leaves.