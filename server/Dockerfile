FROM golang:1.25-alpine AS builder

WORKDIR /src

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY server/ ./server/

RUN CGO_ENABLED=0 go build -o /bin/altradits-api ./server/cmd/api && \
    CGO_ENABLED=0 go build -o /bin/altradits-migrate ./server/cmd/migrate

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /bin/altradits-api /app/altradits-api
COPY --from=builder /bin/altradits-migrate /app/altradits-migrate
COPY server/database/migrations /app/server/database/migrations
COPY scripts/docker-api-entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/app/entrypoint.sh"]
