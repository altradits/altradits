## Current

Every file in STRUCTURE.md now exists. Most are scaffolding: a one-line
description comment plus a `TODO` marking what still needs to be built.
`cmd/server/main.go` runs a vanilla `net/http` server that serves
`web/templates/home.html` and `web/static/`, with the rest of the routes
left as commented-out TODOs mapped to their handler files.

## Target

See [STRUCTURE.md](STRUCTURE.md) for the full structure and what each file
should contain.
