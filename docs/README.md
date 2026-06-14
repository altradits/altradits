## Current

```
altradits/
├── README.md
├── SETUP.md
├── LICENSE
├── Makefile
├── logo.png
├── go.mod
├── go.sum
│
├── docs/
│   └── STRUCTURE.md
│
├── cmd/
│   └── server/
│       └── main.go
│
└── internal/
    ├── handlers/
    │   ├── auth.go
    │   └── customer.go
    ├── db/
    │   ├── connection.go
    │   ├── queries.go
    │   ├── migrations.go
    │   └── seed.go
    ├── models/
    │   ├── user.go
    │   ├── wallet.go
    │   └── transaction.go
    ├── middleware/
    │   ├── auth.go
    │   └── logging.go
    └── utils/
        ├── crypto.go
        ├── validators.go
        └── formatters.go
```

## Target

See [STRUCTURE.md](STRUCTURE.md).
