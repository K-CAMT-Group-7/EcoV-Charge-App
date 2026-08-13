package httpapi

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
	"github.com/gofiber/fiber/v3"
)

type vehicleAccountStore struct {
	account.Store
	createdUserID          string
	createdVehicle         account.Vehicle
	impactSummaryUserID    string
	impactSummaryVehicleID string
}

func (store *vehicleAccountStore) CreateVehicle(
	_ context.Context,
	userID string,
	vehicle account.Vehicle,
) (account.Vehicle, error) {
	store.createdUserID = userID
	store.createdVehicle = vehicle
	vehicle.ID = "vehicle-1"
	vehicle.UserID = userID
	vehicle.CreatedAt = time.Date(2026, time.August, 13, 0, 0, 0, 0, time.UTC)
	vehicle.UpdatedAt = vehicle.CreatedAt
	return vehicle, nil
}

func (store *vehicleAccountStore) GetChargingImpactSummary(
	_ context.Context,
	userID string,
	vehicleID string,
) (account.ChargingImpactSummary, error) {
	store.impactSummaryUserID = userID
	store.impactSummaryVehicleID = vehicleID
	return account.ChargingImpactSummary{ChargingCount: 4, CarbonSavingsGCO2: 1250}, nil
}

func TestCreateVehicleAddsVehicleToAuthenticatedAccount(t *testing.T) {
	store := &vehicleAccountStore{}
	api := &API{accounts: store}
	app := fiber.New()
	app.Post("/vehicles", func(c fiber.Ctx) error {
		c.Locals(userLocalKey, account.User{ID: "authenticated-user"})
		return api.createVehicle(c)
	})

	request := httptest.NewRequest("POST", "/vehicles", strings.NewReader(`{
		"id":"client-controlled-id",
		"userId":"another-user",
		"displayName":"  Tesla Model 3  ",
		"manufacturer":" Tesla ",
		"model":" Model 3 ",
		"modelYear":2026,
		"batteryCapacityKwh":60,
		"acChargingPowerKw":11,
		"dcFastChargingPowerKw":175,
		"chargingEfficiency":0.92,
		"connectorTypes":[" NACS "]
	}`))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("create vehicle request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusCreated {
		t.Fatalf("expected 201, got %d", response.StatusCode)
	}
	if store.createdUserID != "authenticated-user" {
		t.Fatalf("vehicle assigned to %q", store.createdUserID)
	}
	if store.createdVehicle.DisplayName != "Tesla Model 3" || store.createdVehicle.ConnectorTypes[0] != "NACS" {
		t.Fatalf("vehicle fields were not normalized: %#v", store.createdVehicle)
	}

	var created account.Vehicle
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if created.ID != "vehicle-1" || created.UserID != "authenticated-user" {
		t.Fatalf("server-managed fields are invalid: %#v", created)
	}
}

func TestChargingImpactSummaryIsScopedToAuthenticatedUserAndVehicle(t *testing.T) {
	store := &vehicleAccountStore{}
	api := &API{accounts: store}
	app := fiber.New()
	app.Get("/charging-records/impact-summary", func(c fiber.Ctx) error {
		c.Locals(userLocalKey, account.User{ID: "authenticated-user"})
		return api.getChargingImpactSummary(c)
	})

	request := httptest.NewRequest(
		"GET",
		"/charging-records/impact-summary?vehicleId=vehicle-1",
		nil,
	)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("charging impact summary request failed: %v", err)
	}
	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("expected 200, got %d", response.StatusCode)
	}
	if store.impactSummaryUserID != "authenticated-user" || store.impactSummaryVehicleID != "vehicle-1" {
		t.Fatalf("summary scope is invalid: user=%q vehicle=%q", store.impactSummaryUserID, store.impactSummaryVehicleID)
	}

	var summary account.ChargingImpactSummary
	if err := json.NewDecoder(response.Body).Decode(&summary); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if summary.ChargingCount != 4 || summary.CarbonSavingsGCO2 != 1250 {
		t.Fatalf("unexpected summary: %#v", summary)
	}
}
