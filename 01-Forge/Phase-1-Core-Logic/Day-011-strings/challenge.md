# Anomaly Report: Day 011

## The Anomaly to Test
**Substring Confusion:** Does `strings.Contains` return true if the word is part of another word (e.g., searching for "CAT" in "COMMUNICATE")?

## Execution Steps
1. Create a string `entry := "PENDING_PAYMENT"`.
2. Check if it contains "END".
3. Observe how a partial match might lead to a "False Positive" in a ledger search.

## The Fintech Lesson
In Altradits, we must be precise. If we search for a "DEBIT" status, we must ensure we aren't accidentally matching a word like "INDEBTED" unless intended.