package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/auth"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/charging"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/config"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/database"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/electricitymaps"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/httpapi"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/postgres"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	startupContext, startupCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer startupCancel()
	pool, err := database.Connect(startupContext, cfg.DatabaseURL)
	if err != nil {
		slog.Error("failed to connect database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := database.Migrate(startupContext, pool); err != nil {
		slog.Error("failed to migrate database", "error", err)
		os.Exit(1)
	}

	carbonClient := electricitymaps.NewClient(cfg.ElectricityMapsBaseURL, cfg.ElectricityMapsAPIKey, nil)
	accountStore := postgres.NewStore(pool)
	schedulerContext, schedulerCancel := context.WithCancel(context.Background())
	defer schedulerCancel()
	go (charging.Scheduler{Store: accountStore, Forecast: carbonClient, Logger: slog.Default()}).Run(schedulerContext)
	authService := auth.NewService(
		accountStore,
		auth.NewGoogleIDTokenVerifier(cfg.GoogleClientID),
		cfg.SessionTTL,
	)
	app := httpapi.New(httpapi.Dependencies{
		CarbonForecast:   carbonClient,
		AllowedOrigins:   cfg.AllowedOrigins,
		Accounts:         accountStore,
		ChargingSessions: accountStore,
		Auth:             authService,
	})

	errCh := make(chan error, 1)
	go func() {
		slog.Info("EcoV Charge server started", "address", cfg.Address)
		errCh <- app.Listen(cfg.Address)
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)

	select {
	case sig := <-signals:
		slog.Info("shutting down", "signal", sig.String())
	case err := <-errCh:
		if err != nil {
			slog.Error("server stopped", "error", err)
		}
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := app.ShutdownWithContext(ctx); err != nil && !errors.Is(err, context.Canceled) {
		slog.Error("graceful shutdown failed", "error", err)
	}
}
