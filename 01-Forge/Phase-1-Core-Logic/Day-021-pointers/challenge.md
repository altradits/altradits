# Anomaly Report: Day 021

## The Anomaly to Test
**The Nil Pointer Panic:** What happens if you try to dereference a pointer that points to nothing (nil)?

## Execution Steps
1. Declare a pointer without initializing it: `var p *int`.
2. Attempt to print its value: `fmt.Println(*p)`.
3. Observe the runtime error.

## The Fintech Lesson
A "Nil Pointer Dereference" is the #1 cause of program crashes in Go. If our Altradits engine tries to access an "Owner" pointer that hasn't been linked to a user yet, the entire bank crashes. We must always check `if p != nil` before touching the data.