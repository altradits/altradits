package sandbox
package sandbox

import (
    "context"
    "github.com/e2b-dev/e2b-go/pkg/e2b"
)

const E2B_API_KEY = "e2b_98978b162bfdeddff0c32f8c151d8d43720a8459"

func Execute(code string) (string, string, error) {
    ctx := context.Background()
    
    // Create real E2B session
    session, err := e2b.NewSession(ctx, "base", e2b.WithApiKey(E2B_API_KEY))
    if err != nil {
        return "", "", err
    }
    defer session.Close(ctx)

    // Write the student's code to the VM filesystem
    session.Filesystem().WriteFile(ctx, "main.go", code)

    // Run the Go code
    cmd, _ := session.Process().Start(ctx, "go run main.go")
    result, _ := cmd.Wait(ctx)

    return result.Stdout, result.Stderr, nil
}
