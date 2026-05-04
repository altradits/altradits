# Anomaly Report: Day 009

## The Anomaly to Test
**Malformed Financial Input:** What happens if the string contains a leading space, a trailing decimal, or a currency symbol?

## Execution Steps
1. Test `strconv.Atoi` with the following strings: " 500", "500.0", "$500", and "500 ".
2. Print the error message for each.

## The Fintech Lesson
Altradits must decide: do we "Clean" the input (strip the $ sign) or "Reject" the input? For high-security systems, Rejection is often safer than guessing user intent.