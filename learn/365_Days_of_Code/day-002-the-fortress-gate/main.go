package main

import (
	"fmt"
	"os"
	"strconv"
)

func main() {
	cmd := os.Args[1]
	codeProvided, err := strconv.Atoi(cmd)
	if err != nil {
		fmt.Println("[FORTRESS CHECK] ERROR: Invalid security code format. Access Denied.")
		return
	}
	securityCode := 1777

	if codeProvided == securityCode {
		fmt.Println("[FORTRESS CHECK] Validation Successful. Pulse Active.")
	} else {
		fmt.Println("[FORTRESS CHECK] ALERT: Unauthorized Access Detected. Locking System.")
	}
}
