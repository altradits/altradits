package main

import (
	"fmt"
	"unsafe"
)

type AuditLog struct {
	ID      int64  // 8 bytes
	Active  bool   // 1 byte
	Version int32  // 4 bytes
}

func main() {
	// TASK:
	// 1. Create an instance of 'AuditLog'.
	// 2. Use unsafe.Sizeof() to see the total memory footprint.
	// 3. Use unsafe.Offsetof() to see where the 'Version' field starts.
	// 4. Observe "Padding": Why is the total size larger than the sum of the fields?
	// 5. Challenge: Rearrange the struct fields to reduce the total memory size.
}