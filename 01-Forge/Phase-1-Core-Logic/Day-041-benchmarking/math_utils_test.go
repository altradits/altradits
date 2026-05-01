package mathutils

import "testing"

// TASK:
// 1. Create a function 'BenchmarkFibonacci(b *testing.B)'.
// 2. Use a loop 'for i := 0; i < b.N; i++' to run the function.
// 3. Call Fibonacci(20) inside the loop.
// 4. Run the benchmark using: 'go test -bench=.'
func BenchmarkFibonacci(b *testing.B) {
	for i := 0; i < b.N; i++ {
		Fibonacci(20)
	}
}