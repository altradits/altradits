package main

import (
	"golang.org/x/crypto/bcrypt"
	"fmt"
)

// HashPassword turns plain text into a secure fortress
func HashPassword(password string) (string, error) {
	// Cost of 12 is a balance between security and speed (takes ~250ms)
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

// CheckPasswordHash compares a login attempt with our stored secret
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}