# Anomaly Report: Day 003

## The Anomaly to Test
**Buffer Pollution:** What happens if the user enters a Word (string) when Scanln is expecting a Number (int)?

## Execution Steps
1. Run the program.
2. When prompted for the deposit amount, type "hacking" and press Enter.
3. Observe the error returned by Scanln and the final value of the integer variable.

## The Fintech Lesson
If an Altradits terminal user enters "text" instead of "money," and we don't check the error, does the balance update to 0, or does the program crash? Which is safer for a bank?