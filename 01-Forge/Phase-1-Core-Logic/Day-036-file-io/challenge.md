# Anomaly Report: Day 036

## The Anomaly to Test
**The Overwrite Trap:** Does `os.WriteFile` append data or replace the entire file?

## Execution Steps
1. Write "Initial Deposit: $100" to a file.
2. Run the code again but write "Withdrawal: $50" to the same filename.
3. Read the file. Did the first line survive?

## The Fintech Lesson
`os.WriteFile` truncates (erases) the file before writing. In Altradits, using this for an audit log would delete the bank's history every time a new transaction occurs! We must learn to use `os.OpenFile` with the correct flags for persistent logging.