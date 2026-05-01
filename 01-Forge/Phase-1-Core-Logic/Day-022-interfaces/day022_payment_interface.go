package main

import "fmt"

// TASK:
// 1. Define an interface 'Payer' with one method: Pay(amount int).
// 2. Create two structs: 'CreditCard' and 'CryptoWallet'.
// 3. Implement the 'Pay' method for both structs.
// 4. Create a function 'ProcessPayment(p Payer, amount int)' that calls p.Pay.
// 5. In main, pass both a CreditCard and a CryptoWallet to ProcessPayment.

type Payer interface {
	Pay(amount int)
}

func main() {
    // Execution goes here...
}
