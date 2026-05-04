# Anomaly Report: Day 037

## The Anomaly to Test
**The Buffer Limit:** What happens if a single line in your text file is massive (e.g., 1MB of text without a newline)?

## Execution Steps
1. Create a file with one extremely long line.
2. Attempt to read it with `bufio.Scanner`.
3. Check the `scanner.Err()` output after the loop.

## The Fintech Lesson
Standard scanners have a buffer limit (usually 64KB). If a bank's transaction log contains an unexpectedly huge encrypted string on one line, the scanner will fail. In Altradits, we must anticipate "Abnormal Data Sizes" and use `scanner.Buffer()` to expand our capacity.