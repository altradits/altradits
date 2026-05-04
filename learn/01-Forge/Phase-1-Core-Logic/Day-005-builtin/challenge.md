# Anomaly Report: Day 005

## The Anomaly to Test
**Constant Immutability:** Can we bypass the 'const' protection using pointers or other tricks?

## Execution Steps
1. Declare `const VaultKey = 1234`.
2. Try to assign a new value to it. 
3. Try to take the memory address of the constant (using `&VaultKey`).

## The Fintech Lesson
If a hacker cannot even "point" to the memory address of a constant, how does this make 'const' the ultimate defense for hardcoded security rules in Altradits?