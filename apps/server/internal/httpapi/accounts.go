package httpapi

import (
	"errors"
	"strconv"
	"strings"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
	"github.com/gofiber/fiber/v3"
)

const (
	userLocalKey  = "authenticatedUser"
	tokenLocalKey = "sessionToken"
)

type googleLoginRequest struct {
	IDToken    string `json:"idToken"`
	DeviceName string `json:"deviceName"`
}

func (api *API) loginGoogle(c fiber.Ctx) error {
	if api.auth == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "authentication is not configured")
	}
	var request googleLoginRequest
	if err := c.Bind().Body(&request); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	result, err := api.auth.LoginWithGoogle(c.Context(), request.IDToken, request.DeviceName)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Google authentication failed")
	}
	return c.JSON(result)
}

func (api *API) requireAuth(c fiber.Ctx) error {
	if api.auth == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "authentication is not configured")
	}
	header := strings.TrimSpace(c.Get("Authorization"))
	if !strings.HasPrefix(header, "Bearer ") {
		return fiber.NewError(fiber.StatusUnauthorized, "Bearer session token is required")
	}
	token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
	_, user, err := api.auth.Authenticate(c.Context(), token)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "invalid or expired session")
	}
	c.Locals(userLocalKey, user)
	c.Locals(tokenLocalKey, token)
	return c.Next()
}

func (api *API) getMe(c fiber.Ctx) error {
	return c.JSON(currentUser(c))
}

func (api *API) logout(c fiber.Ctx) error {
	token, _ := c.Locals(tokenLocalKey).(string)
	if err := api.auth.Logout(c.Context(), token); err != nil {
		return err
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (api *API) createVehicle(c fiber.Ctx) error {
	var vehicle account.Vehicle
	if err := c.Bind().Body(&vehicle); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	if err := validateVehicle(vehicle); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	created, err := api.accounts.CreateVehicle(c.Context(), currentUser(c).ID, vehicle)
	if err != nil {
		return err
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (api *API) listVehicles(c fiber.Ctx) error {
	vehicles, err := api.accounts.ListVehicles(c.Context(), currentUser(c).ID)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"vehicles": vehicles})
}

func (api *API) updateVehicle(c fiber.Ctx) error {
	var vehicle account.Vehicle
	if err := c.Bind().Body(&vehicle); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	if err := validateVehicle(vehicle); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	updated, err := api.accounts.UpdateVehicle(
		c.Context(), currentUser(c).ID, c.Params("vehicleId"), vehicle,
	)
	if err != nil {
		return resourceError(err)
	}
	return c.JSON(updated)
}

func (api *API) getVehicle(c fiber.Ctx) error {
	vehicle, err := api.accounts.GetVehicle(c.Context(), currentUser(c).ID, c.Params("vehicleId"))
	if err != nil {
		return resourceError(err)
	}
	return c.JSON(vehicle)
}

func (api *API) deleteVehicle(c fiber.Ctx) error {
	err := api.accounts.DeleteVehicle(c.Context(), currentUser(c).ID, c.Params("vehicleId"))
	if err != nil {
		return resourceError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (api *API) createChargingRecord(c fiber.Ctx) error {
	var record account.ChargingRecord
	if err := c.Bind().Body(&record); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	if err := validateChargingRecord(record); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	created, err := api.accounts.CreateChargingRecord(c.Context(), currentUser(c).ID, record)
	if err != nil {
		return resourceError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(created)
}

func (api *API) listChargingRecords(c fiber.Ctx) error {
	limit := 50
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 200 {
			return fiber.NewError(fiber.StatusBadRequest, "limit must be between 1 and 200")
		}
		limit = parsed
	}
	records, err := api.accounts.ListChargingRecords(
		c.Context(), currentUser(c).ID, strings.TrimSpace(c.Query("vehicleId")), limit,
	)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"chargingRecords": records})
}

func (api *API) getChargingRecord(c fiber.Ctx) error {
	record, err := api.accounts.GetChargingRecord(c.Context(), currentUser(c).ID, c.Params("recordId"))
	if err != nil {
		return resourceError(err)
	}
	return c.JSON(record)
}

func (api *API) deleteChargingRecord(c fiber.Ctx) error {
	err := api.accounts.DeleteChargingRecord(c.Context(), currentUser(c).ID, c.Params("recordId"))
	if err != nil {
		return resourceError(err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func currentUser(c fiber.Ctx) account.User {
	user, _ := c.Locals(userLocalKey).(account.User)
	return user
}

func resourceError(err error) error {
	if errors.Is(err, account.ErrNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "resource not found")
	}
	return err
}

func validateVehicle(vehicle account.Vehicle) error {
	if strings.TrimSpace(vehicle.DisplayName) == "" || strings.TrimSpace(vehicle.Manufacturer) == "" ||
		strings.TrimSpace(vehicle.Model) == "" {
		return errors.New("displayName, manufacturer, and model are required")
	}
	if vehicle.ModelYear < 1886 || vehicle.BatteryCapacityKWh <= 0 ||
		vehicle.ACChargingPowerKW <= 0 || vehicle.DCFastChargingPowerKW <= 0 {
		return errors.New("vehicle year, capacity, and charging power are invalid")
	}
	if vehicle.ChargingEfficiency <= 0 || vehicle.ChargingEfficiency > 1 {
		return errors.New("chargingEfficiency must be in the range (0, 1]")
	}
	if len(vehicle.ConnectorTypes) == 0 {
		return errors.New("at least one connector type is required")
	}
	return nil
}

func validateChargingRecord(record account.ChargingRecord) error {
	if strings.TrimSpace(record.VehicleID) == "" || record.StartedAt.IsZero() || record.EndedAt.IsZero() {
		return errors.New("vehicleId, startedAt, and endedAt are required")
	}
	if record.EndedAt.Before(record.StartedAt) {
		return errors.New("endedAt must not be earlier than startedAt")
	}
	if record.StartBatteryPercent < 0 || record.EndBatteryPercent > 100 ||
		record.EndBatteryPercent < record.StartBatteryPercent || record.BatteryEnergyKWh <= 0 {
		return errors.New("battery percentages or energy are invalid")
	}
	return nil
}
