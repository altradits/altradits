func main() {
	userPassword := "ForgeMaster2026!"

	// 1. REGISTRATION
	hash, _ := HashPassword(userPassword)
	fmt.Printf("Stored in Database: %s\n", hash)

	// 2. LOGIN ATTEMPT
	attempt := "ForgeMaster2026!"
	if CheckPasswordHash(attempt, hash) {
		fmt.Println("✅ Access Granted: Identity Verified.")
	} else {
		fmt.Println("❌ Access Denied: Invalid Credentials.")
	}
}