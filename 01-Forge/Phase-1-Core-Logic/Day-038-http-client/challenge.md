# Anomaly Report: Day 038

## The Anomaly to Test
**The Leaky Connection:** What happens if you forget to close the response body in a loop?

## Execution Steps
1. Create a loop that makes 1000 HTTP requests.
2. Remove the `Body.Close()` call.
3. Monitor your open file descriptors or network connections.

## The Fintech Lesson
Each unclosed body keeps a network socket open. Eventually, the operating system will refuse to open any more connections, and the Altradits server will be unable to communicate with any payment gateways. This is a "Silent DoS" (Denial of Service).