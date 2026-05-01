# Anomaly Report: Day 083

## The Anomaly to Test
**The External Attack:** What happens if you try to trigger the `/vault/drain` endpoint using `curl` or a different browser tab without the token?

## Execution Steps
1. Start the server.
2. Open a terminal and run: `curl -X POST http://localhost:8080/vault/drain`.
3. Observe the `400 Bad Request` or `403 Forbidden` response.

## The Fintech Lesson
Your server is now "Exclusive." It only listens to requests that it specifically invited via a token. In Altradits, we don't just verify **who** the user is (Auth); we verify **where** the request came from (CSRF).


go get github.com/justinas/nosurf

git add 04-Security/Day-083-csrf/
git commit -m "feat(security): implement CSRF protection middleware and HTMX header integration"