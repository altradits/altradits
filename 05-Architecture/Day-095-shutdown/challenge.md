# Anomaly Report: Day 095

## The Anomaly to Test
**The Interrupted Transaction:** Can we kill the server without killing the task?

## Execution Steps
1. Start the server.
2. In a browser/terminal, trigger `http://localhost:8080/long-task`.
3. Immediately go to the server terminal and hit `Ctrl+C`.
4. Observe the log: The server says "Shutting down," but it **does not exit** immediately. 
5. Observe the browser: It still receives "Task Finished Safely" after 5 seconds.
6. Only then does the server process terminate.

## The Systems Lesson
In Altradits, **Reliability > Speed**. A graceful shutdown ensures that the Founder's experience is never "chopped off" mid-action. This is the hallmark of a professional-grade systems engineer.




# Run the test
go run 05-Architecture/Day-095-shutdown/main.go

git add 05-Architecture/Day-095-shutdown/
git commit -m "feat(arch): implement graceful shutdown for HTTP server and background processes"