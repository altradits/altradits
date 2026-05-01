# Anomaly Report: Day 084

## The Anomaly to Test
**The Automated Hammer:** Can we break through the limiter with a simple script?

## Execution Steps
1. Start the server.
2. Run this command in your terminal: `for i in {1..20}; do curl -I http://localhost:8080/api/secure-data; done`
3. Observe how the first 10 requests succeed (the burst) and the next 10 fail with `429 Too Many Requests`.

## The Fintech Lesson
Security is about **fairness**. A single malfunctioning bot shouldn't prevent a real Founder from accessing their vault. By implementing rate limiting, you ensure that the Forge remains stable and available for everyone, even under pressure.



go get golang.org/x/time/rate

git add 04-Security/Day-084-rate-limiting/
git commit -m "feat(security): implement per-IP rate limiting using token bucket algorithm"