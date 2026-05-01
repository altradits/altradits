# Anomaly Report: Day 073

## The Anomaly to Test
**The Connection Leak:** What happens if you acquire a connection but never "return" it to the pool?

## Execution Steps
1. Use raw `pool.Acquire(ctx)` to get a connection manually.
2. Forget to call `conn.Release()`.
3. Loop this 20 times.
4. Try to run a SQLc query. Observe the "Context Deadline Exceeded" or the application hanging forever.

## The Fintech Lesson
Resources are finite. In Altradits, every connection is a "loan." If we don't return the loan, the system goes bankrupt. By using SQLc's generated methods, we avoid leaks because it handles the acquire/release cycle automatically for every query.

# Get the driver
go get github.com/jackc/pgx/v5

git add 03-Persistence/Day-073-pgx/
git commit -m "feat(persistence): implement pgx connection pooling for optimized database access"