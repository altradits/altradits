func LoginHandler(w http.ResponseWriter, r *http.Request) {
    username := r.FormValue("username")
    password := r.FormValue("password")

    // 1. Fetch user from Postgres
    user, err := store.GetUserByUsername(r.Context(), username)
    
    // 2. Verify with Bcrypt
    if err != nil || !CheckPasswordHash(password, user.PasswordHash) {
        http.Error(w, "Invalid Credentials", http.StatusUnauthorized)
        return
    }

    // 3. Issue JWT
    token, _ := GenerateToken(user.ID, user.Role)
    
    // 4. Set as Secure Cookie
    http.SetCookie(w, &http.Cookie{
        Name: "forge_token",
        Value: token,
        HttpOnly: true,
        Secure: true,
        SameSite: http.SameSiteStrictMode,
    })
}