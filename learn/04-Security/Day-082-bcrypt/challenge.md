# Anomaly Report: Day 082

## The Anomaly to Test
**The Collision Myth:** If you hash the same password "123456" twice, are the resulting strings identical?

## Execution Steps
1. Run `HashPassword("altradits")` twice in a row.
2. Print both results.
3. Observe that they look completely different despite having the same input.

## The Fintech Lesson
Because Bcrypt generates a new random **Salt** every time, the output is always unique. This ensures that even if two Founders use the same password, an attacker looking at the database wouldn't know it. In Altradits, privacy is maintained even among equals.


go get golang.org/x/crypto/bcrypt

git add 04-Security/Day-082-bcrypt/
git commit -m "feat(security): implement Bcrypt password hashing and verification"
