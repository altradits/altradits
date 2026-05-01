package main

import "fmt"

type User struct {
	Name  string
	Email string
}

// TASK:
// 1. Create a struct 'BusinessAccount' that embeds the 'User' struct.
// 2. Add a unique field: 'CompanyName string'.
// 3. In main, initialize 'BusinessAccount' and access the 'Name' field directly (promotion).
// 4. Observe: You can call myBiz.Name instead of myBiz.User.Name.
// 5. Challenge: Add a method to 'User' and call it from the 'BusinessAccount' instance.