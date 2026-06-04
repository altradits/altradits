## GOPATH and GOMODECACHE Setup
1. Create a local Go folder
```bash
mkdir -p ~/go
```
2. Append the new paths to your new shell profiles
```bash
echo 'export GOPATH=$HOME/go' >> ~/bashrc
echo 'export GOMODCACHE=$HOME/go/pkg/mod' >> ~/.bashrc
echo 'export PATH=$PATH:$GOPATH/bin' >> ~/.bashrc
```
3. Apply the changes to your current session
```bash
source ~/.bashrc
```
4. Verify the changes
```bash
go env GOPATH GOMODCACHE
```

##### Expected Output
```bash
go: downloading go1.25.0 (linux/amd64)
/home/sthuita/go
/home/sthuita/go/pkg/mod
```

5. Initialize the project
```
go mod init altradits
go get github.com/gin-gonic/gin
```

---

## Starting the Application

After completing the setup, you can start the Altradits application using one of the following methods:

### Method 1: Docker Compose (Recommended)

This method runs all services (frontend, backend, database, and cache) in containers.

**Prerequisites:**
- Docker and Docker Compose installed
- `.env` file configured (see Environment Variables section below)

**Start all services:**
```bash
docker compose up --build
```

This will start:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

**To run in detached mode:**
```bash
docker compose up -d
```

**To stop all services:**
```bash
docker compose down
```

**To reset the database (wipe and recreate):**
```bash
make db-reset
```

---

### Method 2: Development Mode (Hot Reload)

This method runs services locally with hot reload for development.

**Step 1: Start infrastructure (Database + Redis)**
```bash
make dev-db
```
Or manually:
```bash
docker compose up -d db cache
```

**Step 2: Run database migrations**
```bash
make migrate-up
```
Or manually:
```bash
cd server && go run ./cmd/migrate/main.go up
```

**Step 3: Start the backend (with Air live reload)**
```bash
make dev-backend
```
Or manually:
```bash
cd server && air
```

**Step 4: Start the frontend (in a new terminal)**
```bash
make dev-frontend
```
Or manually:
```bash
cd apps/web && npm run dev
```

---

### Method 3: Manual Start (No Docker)

**Prerequisites:**
- PostgreSQL running locally (or accessible)
- Redis running locally (or accessible)
- Go 1.25+ installed
- Node.js 18+ installed

**Step 1: Set up environment variables**
Create a `.env` file in the project root:
```bash
cp .env.example .env
```

Edit `.env` with your local database and Redis connection strings:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/altradits?sslmode=disable
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here
OPENAI_API_KEY=your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here
```

**Step 2: Install Go dependencies**
```bash
go mod download
```

**Step 3: Install frontend dependencies**
```bash
cd apps/web && npm install
```

**Step 4: Run database migrations**
```bash
cd server && go run ./cmd/migrate/main.go up
```

**Step 5: Start the backend**
```bash
go run ./server/cmd/api
```

**Step 6: Start the frontend (in a new terminal)**
```bash
cd apps/web && npm run dev
```

---

## Environment Variables

| Variable | Description | Default (Docker) |
|----------|-------------|----------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://postgres:postgres@db:5432/altradits` |
| `REDIS_URL` | Redis connection string | `redis://cache:6379` |
| `JWT_SECRET` | Secret key for JWT signing | `your-secret-key` |
| `OPENAI_API_KEY` | OpenAI API key for AI features | `your-openai-key` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude AI | `your-anthropic-key` |

---

## Available Make Commands

```bash
make dev           # Start all services with Docker Compose
make dev-db        # Start only database and cache
make dev-backend   # Run Go backend with Air live reload
make dev-frontend  # Run Next.js frontend dev server
make migrate-up    # Apply all pending migrations
make migrate-down  # Roll back last migration
make db-reset      # Wipe and recreate database
make build-backend # Build backend binary
make test          # Run all tests
```

---

## Verifying the Application

Once started, verify the application is running:

**Health Check:**
```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "database": {"connected": true},
  "redis": {"connected": true},
  "app": "altradits",
  "version": "0.1.0"
}
```

**Access the application:**
- Frontend: http://localhost:3000
- API: http://localhost:8080

---

## Troubleshooting

**Port already in use:**
- If port 3000 is in use: `lsof -i :3000` to find and kill the process
- If port 8080 is in use: `lsof -i :8080` to find and kill the process

**Database connection failed:**
- Ensure PostgreSQL is running: `docker compose ps db`
- Check the DATABASE_URL in your `.env` file

**Redis connection failed:**
- Ensure Redis is running: `docker compose ps cache`
- Check the REDIS_URL in your `.env` file

**Migration errors:**
- Reset the database: `make db-reset`
- Or manually: `docker compose down -v && docker compose up -d db cache`
