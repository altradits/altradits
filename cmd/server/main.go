package server
package main

import (
    "log"
    "github.com/altradits/altradits/pkg/ui"
    "github.com/gofiber/fiber/v2"
    "github.com/gofiber/template/html/v2"
)

func main() {
    // Setup HTML engine for web/templates
    engine := html.New("./web/templates", ".html")

    app := fiber.New(fiber.Config{
        Views: engine,
    })

    // Serve styles.css from the static directory
    app.Static("/static", "./web/static")

    // Main Forge route
    app.Get("/", func(c *fiber.Ctx) error {
        return c.Render("index", nil)
    })

    // HTMX endpoint to handle code execution
    app.Post("/forge/run", ui.HandleRunCode)

    log.Fatal(app.Listen(":3000"))
}
