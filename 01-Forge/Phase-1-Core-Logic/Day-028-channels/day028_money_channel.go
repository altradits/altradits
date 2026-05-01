package main

import "fmt"

func main() {
	// TASK:
	// 1. Create an unbuffered channel of integers: 'ch := make(chan int)'.
	// 2. Launch a goroutine that sends the number 100 into the channel: 'ch <- 100'.
	// 3. In the main goroutine, receive the value from the channel: 'val := <-ch'.
	// 4. Print the received value.
	// 5. Challenge: Try to receive a second value without sending one and see what happens.
}