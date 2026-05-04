# Anomaly Report: Day 076

## The Anomaly to Test
**The Stale Data Anomaly:** What happens if the Go server updates the balance in Postgres but fails to update it in Redis?

## Execution Steps
1. Set a balance in Redis manually using `redis-cli SET balance:stan_01 5000`.
2. Update the balance in your Postgres table to `4000`.
3. Load the dashboard. 
4. Observe the discrepancy. 

## The Fintech Lesson
A fast lie is worse than a slow truth. In Altradits, we must use the **Write-Through** or **Invalidation** strategy. Whenever the database (Truth) changes, the cache must be purged or updated within the same transaction. Speed is the goal, but Accuracy is the law.

go get github.com/redis/go-redis/v9
docker-compose up -d cache

git add 03-Persistence/Day-076-redis/
git commit -m "feat(persistence): implement Redis caching using the Cache-Aside pattern"