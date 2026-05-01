# Anomaly Report: Day 092

## The Anomaly to Test
**The Re-queueing Loop:** Can we prove that RabbitMQ doesn't lose data?

## Execution Steps
1. Start `consumer.go`.
2. Run `producer.go` to send a message.
3. While the consumer is "working" (during the 3-second sleep), kill the consumer with `CTRL+C`.
4. Restart the consumer.
5. Observe that the consumer immediately receives the *same* message again.

## The Systems Lesson
In Altradits, we optimize for **Durability**. By combining persistent queues with manual acknowledgments, we create a "Guaranteed Delivery" system. Even if our entire worker cluster restarts, not a single audit log or transaction record will be dropped.