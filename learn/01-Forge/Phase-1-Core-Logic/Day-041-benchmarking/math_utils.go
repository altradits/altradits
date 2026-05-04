package mathutils

// TASK:
// 1. Create a function 'Fibonacci(n int) int' that calculates the nth 
//    Fibonacci number using recursion.
func Fibonacci(n int) int {
	if n <= 1 {
		return n
	}
	return Fibonacci(n-1) + Fibonacci(n-2)
}