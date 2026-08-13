package httpapi

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/auth"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/charging"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	recovermiddleware "github.com/gofiber/fiber/v3/middleware/recover"
)

type CarbonForecastProvider interface {
	Forecast(
		ctx context.Context,
		latitude float64,
		longitude float64,
		horizonHours int,
	) (charging.Forecast, error)
}

type Dependencies struct {
	CarbonForecast   CarbonForecastProvider
	AllowedOrigins   []string
	Accounts         account.Store
	ChargingSessions account.ChargingSessionStore
	Auth             *auth.Service
}

type API struct {
	carbonForecast   CarbonForecastProvider
	accounts         account.Store
	chargingSessions account.ChargingSessionStore
	auth             *auth.Service
}

type location struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type planRequest struct {
	Location         location         `json:"location"`
	Now              *time.Time       `json:"now"`
	Deadline         time.Time        `json:"deadline"`
	CurrentEnergyKWh float64          `json:"currentEnergyKwh"`
	TargetEnergyKWh  float64          `json:"targetEnergyKwh"`
	Vehicle          charging.Vehicle `json:"vehicle"`
}

type backtestRequest struct {
	Location location          `json:"location"`
	Runs     int               `json:"runs"`
	Seed     int64             `json:"seed"`
	Vehicle  *charging.Vehicle `json:"vehicle"`
}

func New(dependencies Dependencies) *fiber.App {
	api := &API{
		carbonForecast:   dependencies.CarbonForecast,
		accounts:         dependencies.Accounts,
		chargingSessions: dependencies.ChargingSessions,
		auth:             dependencies.Auth,
	}
	app := fiber.New(fiber.Config{
		AppName: "EcoV Charge API",
		ErrorHandler: func(c fiber.Ctx, err error) error {
			var fiberError *fiber.Error
			if errors.As(err, &fiberError) {
				return c.Status(fiberError.Code).JSON(fiber.Map{"error": fiberError.Message})
			}
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "internal server error"})
		},
	})
	app.Use(recovermiddleware.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: dependencies.AllowedOrigins,
		AllowHeaders: []string{"Origin", "Content-Type", "Accept", "Authorization"},
	}))

	app.Get("/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "ecov-charge-api"})
	})
	v1 := app.Group("/v1")
	v1.Post("/auth/google", api.loginGoogle)
	v1.Get("/carbon/forecast", api.getForecast)
	v1.Post("/charging/plans", api.createPlan)
	v1.Post("/backtests", api.runBacktest)

	authenticated := v1.Group("", api.requireAuth)
	authenticated.Get("/me", api.getMe)
	authenticated.Post("/auth/logout", api.logout)
	authenticated.Get("/vehicles", api.listVehicles)
	authenticated.Post("/vehicles", api.createVehicle)
	authenticated.Get("/vehicles/:vehicleId", api.getVehicle)
	authenticated.Put("/vehicles/:vehicleId", api.updateVehicle)
	authenticated.Delete("/vehicles/:vehicleId", api.deleteVehicle)
	authenticated.Get("/charging-records", api.listChargingRecords)
	authenticated.Post("/charging-records", api.createChargingRecord)
	authenticated.Get("/charging-records/:recordId", api.getChargingRecord)
	authenticated.Delete("/charging-records/:recordId", api.deleteChargingRecord)
	authenticated.Post("/charging-sessions", api.createChargingSession)
	authenticated.Post("/charging-sessions/estimate", api.estimateChargingSession)
	authenticated.Get("/charging-sessions/active", api.getActiveChargingSession)
	authenticated.Post("/charging-sessions/:sessionId/stop", api.stopChargingSession)

	return app
}

func (api *API) getForecast(c fiber.Ctx) error {
	latitude, err := queryFloat(c, "lat")
	if err != nil {
		return err
	}
	longitude, err := queryFloat(c, "lon")
	if err != nil {
		return err
	}
	horizon, err := queryIntDefault(c, "horizonHours", 24)
	if err != nil || horizon < 1 || horizon > 72 {
		return fiber.NewError(fiber.StatusBadRequest, "horizonHours must be between 1 and 72")
	}

	forecast, err := api.carbonForecast.Forecast(c.Context(), latitude, longitude, horizon)
	if err != nil {
		return upstreamError(err)
	}
	return c.JSON(forecast)
}

func (api *API) createPlan(c fiber.Ctx) error {
	var request planRequest
	if err := c.Bind().Body(&request); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	if request.Deadline.IsZero() {
		return fiber.NewError(fiber.StatusBadRequest, "deadline is required")
	}
	now := time.Now().UTC()
	if request.Now != nil {
		now = request.Now.UTC()
	}
	// The controller acts on five-minute boundaries. Align ad-hoc HTTP calls
	// with the same boundary used by the Electricity Maps forecast.
	now = now.Truncate(5 * time.Minute)
	horizon := int(mathCeilHours(request.Deadline.Sub(now)))
	if horizon < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "deadline must be later than now")
	}
	if horizon > 24 {
		return fiber.NewError(fiber.StatusBadRequest, "deadline cannot exceed the 24-hour forecast horizon")
	}

	forecast, err := api.carbonForecast.Forecast(
		c.Context(),
		request.Location.Latitude,
		request.Location.Longitude,
		horizon,
	)
	if err != nil {
		return upstreamError(err)
	}
	plan, err := charging.BuildPlan(charging.PlanInput{
		Now:              now,
		Deadline:         request.Deadline,
		CurrentEnergyKWh: request.CurrentEnergyKWh,
		TargetEnergyKWh:  request.TargetEnergyKWh,
		Vehicle:          request.Vehicle,
	}, forecast.Points)
	if errors.Is(err, charging.ErrInfeasible) {
		return fiber.NewError(fiber.StatusUnprocessableEntity, err.Error())
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"zone": forecast.Zone,
		"plan": plan,
	})
}

func (api *API) runBacktest(c fiber.Ctx) error {
	var request backtestRequest
	if err := c.Bind().Body(&request); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	if request.Runs == 0 {
		request.Runs = 100
	}
	if request.Seed == 0 {
		request.Seed = 20_260_812
	}
	vehicle := charging.Vehicle{
		BatteryCapacityKWh: 79.7,
		MaxChargePowerKW:   11,
		ChargingEfficiency: 0.92,
	}
	if request.Vehicle != nil {
		vehicle = *request.Vehicle
	}

	forecast, err := api.carbonForecast.Forecast(
		c.Context(),
		request.Location.Latitude,
		request.Location.Longitude,
		24,
	)
	if err != nil {
		return upstreamError(err)
	}
	result, err := charging.RunBacktest(forecast.Points, vehicle, request.Runs, request.Seed)
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}

	return c.JSON(fiber.Map{
		"zone":     forecast.Zone,
		"backtest": result,
	})
}

func queryFloat(c fiber.Ctx, name string) (float64, error) {
	value := strings.TrimSpace(c.Query(name))
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("%s must be a number", name))
	}
	return parsed, nil
}

func queryIntDefault(c fiber.Ctx, name string, fallback int) (int, error) {
	value := strings.TrimSpace(c.Query(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fiber.NewError(fiber.StatusBadRequest, fmt.Sprintf("%s must be an integer", name))
	}
	return parsed, nil
}

func upstreamError(err error) error {
	return fiber.NewError(fiber.StatusBadGateway, "unable to retrieve carbon forecast: "+err.Error())
}

func mathCeilHours(duration time.Duration) float64 {
	hours := duration.Hours()
	whole := float64(int(hours))
	if hours > whole {
		return whole + 1
	}
	return whole
}
