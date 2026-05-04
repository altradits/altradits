package main

import (
	"fmt"
	"time"
)

func FastAPI(c chan string) {
	time.Sleep(100 * time.Millisecond)
	c <- "Result from Fast API"
}

func SlowAPI(c chan string) {
	time.Sleep(3 * time.Second)
	c <- "Result from Slow API"
}

func main() {
	c1 := make(chan string)
	c2 := make(chan string)

	go FastAPI(c1)
	go SlowAPI(c2)

	for i := 0; i < 2; i++ {
		select {
		case res := <-c1:
			fmt.Println("✅ Success:", res)
		case res := <-c2:
			fmt.Println("✅ Success:", res)
		case <-time.After(1 * time.Second): 
			// This case wins if no channel provides a result within 1s
			fmt.Println("⚠️  Timeout: Service took too long!")
		}
	}
}