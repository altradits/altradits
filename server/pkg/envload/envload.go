package envload

import "github.com/joho/godotenv"

// Load reads .env from common project locations.
// Works whether commands are run from the repo root or server/.
func Load() {
	for _, path := range []string{".env", "../.env", "server/.env"} {
		_ = godotenv.Load(path)
	}
}
