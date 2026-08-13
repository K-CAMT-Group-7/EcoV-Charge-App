package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Address                string
	AllowedOrigins         []string
	ElectricityMapsBaseURL string
	ElectricityMapsAPIKey  string
	DatabaseURL            string
	GoogleClientID         string
	SessionTTL             time.Duration
}

func Load() (Config, error) {
	// Support both `go run ./apps/server/cmd/api` from the repository root and
	// `go run ./cmd/api` from apps/server. Missing files are allowed because
	// production deployments should inject environment values.
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load(".env")
	_ = godotenv.Load("apps/server/.env")

	baseURL := firstNonEmpty(
		os.Getenv("ELECTRICITYMAPS_API_URL"),
		os.Getenv("EXPO_PUBLIC_ELECTRICITYMAPS_API_URL"),
	)
	apiKey := firstNonEmpty(
		os.Getenv("ELECTRICITYMAPS_API_KEY"),
		os.Getenv("EXPO_PUBLIC_ELECTRICITYMAPS_API_KEY"),
	)
	if baseURL == "" || apiKey == "" {
		return Config{}, fmt.Errorf("ELECTRICITYMAPS_API_URL and ELECTRICITYMAPS_API_KEY are required")
	}
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	googleClientID := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
	if databaseURL == "" || googleClientID == "" {
		return Config{}, fmt.Errorf("DATABASE_URL and GOOGLE_CLIENT_ID are required")
	}
	sessionDays, err := strconv.Atoi(envOrDefault("SESSION_TTL_DAYS", "30"))
	if err != nil || sessionDays < 1 || sessionDays > 365 {
		return Config{}, fmt.Errorf("SESSION_TTL_DAYS must be between 1 and 365")
	}

	return Config{
		Address:                envOrDefault("SERVER_ADDRESS", ":8080"),
		AllowedOrigins:         splitCSV(envOrDefault("CORS_ALLOWED_ORIGINS", "http://localhost:8081,http://localhost:19006")),
		ElectricityMapsBaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		ElectricityMapsAPIKey:  strings.TrimSpace(apiKey),
		DatabaseURL:            databaseURL,
		GoogleClientID:         googleClientID,
		SessionTTL:             time.Duration(sessionDays) * 24 * time.Hour,
	}, nil
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}
