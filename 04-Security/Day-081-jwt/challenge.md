# Anomaly Report: Day 081

## The Anomaly to Test
**The Signature Tamper:** What happens if a user changes the `role` in their JWT from "Viewer" to "Admin" using a tool like jwt.io?

## Execution Steps
1. Generate a valid token for a "Viewer".
2. Edit the payload manually in a text editor.
3. Attempt to access a protected route with the modified token.
4. Observe the "Signature Verification Failed" error.

## The Fintech Lesson
Trust, but verify. In Altradits, we don't trust the *data* in the token until we have verified the *signature*. The signature is the digital wax seal that proves the payload hasn't been touched since the Forge issued it.


go get github.com/golang-jwt/jwt/v5

git add 04-Security/Day-081-jwt/
git commit -m "feat(security): implement stateless JWT authentication and middleware guard"