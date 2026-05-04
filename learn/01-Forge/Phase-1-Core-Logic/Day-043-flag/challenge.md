# Anomaly Report: Day 043

## The Anomaly to Test
**The Argument Gap:** What is the difference between a "Flag" and an "Argument"?

## Execution Steps
1. Run your program: `go run day043_cli_config.go -port=8080 filename.txt`.
2. Access `flag.Args()` and print the result.
3. Observe which part of the command is captured by `flag.Args()`.

## The Fintech Lesson
Flags configure *how* the engine runs (e.g., `-mode=audit`). Arguments specify *what* the engine processes (e.g., `january_ledger.csv`). Altradits needs both to be a professional-grade CLI tool.