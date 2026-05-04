package main

import (
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func main() {
	conn, _ := amqp.Dial("amqp://guest:guest@localhost:5672/")
	defer conn.Close()
	ch, _ := conn.Channel()
	defer ch.Close()

	// 1. Prefetch: Don't give one worker more than 1 message at a time
	// This ensures fair distribution among multiple consumers
	_ = ch.Qos(1, 0, false)

	msgs, _ := ch.Consume(
		"audit_tasks", // queue
		"",            // consumer
		false,         // auto-ack is FALSE (Manual)
		false,         // exclusive
		false,         // no-local
		false,         // no-wait
		nil,           // args
	)

	var forever chan struct{}

	go func() {
		for d := range msgs {
			log.Printf("📥 Received: %s", d.Body)

			// Simulate complex audit work
			dotCount := 3
			for i := 0; i < dotCount; i++ {
				time.Sleep(1 * time.Second)
			}

			log.Printf("✅ Audit Complete for: %s", d.Body)

			// 2. SEND ACKNOWLEDGMENT
			// Multiple=false ensures we only ack THIS specific message
			d.Ack(false)
		}
	}()

	log.Printf(" [*] Waiting for messages. To exit press CTRL+C")
	<-forever
}
