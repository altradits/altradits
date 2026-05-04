# Anomaly Report: Day 016

## The Anomaly to Test
**Out of Bounds:** What happens if you try to delete index 10 from a slice of length 5?

## Execution Steps
1. Create a small slice.
2. Attempt to slice it using an index that is higher than the length.
3. Observe the "panic".

## The Fintech Lesson
Index out of range is a critical crash. Altradits must always check `if index < len(slice)` before performing any deletion or access, or the entire banking service goes offline.
