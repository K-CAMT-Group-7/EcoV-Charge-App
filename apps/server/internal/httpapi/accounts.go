package httpapi

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
	"github.com/ecov-charge/ecov-charge/apps/server/internal/charging"
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

type vehicleRequest struct {
	DisplayName           string   `json:"displayName"`
	Manufacturer          string   `json:"manufacturer"`
	Model                 string   `json:"model"`
	ModelYear             int      `json:"modelYear"`
	BatteryCapacityKWh    float64  `json:"batteryCapacityKwh"`
	ACChargingPowerKW     float64  `json:"acChargingPowerKw"`
	DCFastChargingPowerKW float64  `json:"dcFastChargingPowerKw"`
	ChargingEfficiency    float64  `json:"chargingEfficiency"`
	ConnectorTypes        []string `json:"connectorTypes"`
}

type chargingSessionRequest struct {
	VehicleID            string    `json:"vehicleId"`
	TargetBatteryPercent float64   `json:"targetBatteryPercent"`
	TargetAt             time.Time `json:"targetAt"`
	Latitude             float64   `json:"latitude"`
	Longitude            float64   `json:"longitude"`
}

type chargingEstimateResponse struct {
	OptimizedEmissionsGCO2 float64 `json:"optimizedEmissionsGco2"`
	ImmediateEmissionsGCO2 float64 `json:"immediateEmissionsGco2"`
	CarbonSavingsGCO2      float64 `json:"carbonSavingsGco2"`
}

func (request vehicleRequest) vehicle() account.Vehicle {
	connectorTypes := make([]string, len(request.ConnectorTypes))
	for index, connectorType := range request.ConnectorTypes {
		connectorTypes[index] = strings.TrimSpace(connectorType)
	}
	return account.Vehicle{
		DisplayName:           strings.TrimSpace(request.DisplayName),
		Manufacturer:          strings.TrimSpace(request.Manufacturer),
		Model:                 strings.TrimSpace(request.Model),
		ModelYear:             request.ModelYear,
		BatteryCapacityKWh:    request.BatteryCapacityKWh,
		ACChargingPowerKW:     request.ACChargingPowerKW,
		DCFastChargingPowerKW: request.DCFastChargingPowerKW,
		ChargingEfficiency:    request.ChargingEfficiency,
		ConnectorTypes:        connectorTypes,
	}
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
	var request vehicleRequest
	if err := c.Bind().Body(&request); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	vehicle := request.vehicle()
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
	var request vehicleRequest
	if err := c.Bind().Body(&request); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	vehicle := request.vehicle()
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

func (api *API) getChargingImpactSummary(c fiber.Ctx) error {
	vehicleID := strings.TrimSpace(c.Query("vehicleId"))
	if vehicleID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "vehicleId is required")
	}
	summary, err := api.accounts.GetChargingImpactSummary(
		c.Context(), currentUser(c).ID, vehicleID,
	)
	if err != nil {
		return err
	}
	return c.JSON(summary)
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

func (api *API) createChargingSession(c fiber.Ctx) error {
	var request chargingSessionRequest
	if err := c.Bind().Body(&request); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	estimate, err := api.calculateChargingEstimate(c, request)
	if err != nil {
		return err
	}
	session, err := api.chargingSessions.CreateChargingSession(c.Context(), currentUser(c).ID, account.ChargingSession{VehicleID: strings.TrimSpace(request.VehicleID), StartedAt: time.Now().UTC(), TargetAt: request.TargetAt.UTC(), TargetBatteryPercent: request.TargetBatteryPercent, Latitude: request.Latitude, Longitude: request.Longitude, EstimatedOptimizedEmissionsGCO2: estimate.OptimizedEmissionsGCO2, EstimatedImmediateEmissionsGCO2: estimate.ImmediateEmissionsGCO2, EstimatedCarbonSavingsGCO2: estimate.CarbonSavingsGCO2})
	if err != nil {
		return resourceError(err)
	}
	return c.Status(fiber.StatusCreated).JSON(session)
}

func (api *API) estimateChargingSession(c fiber.Ctx) error {
	var request chargingSessionRequest
	if err := c.Bind().Body(&request); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid JSON request body")
	}
	estimate, err := api.calculateChargingEstimate(c, request)
	if err != nil {
		return err
	}
	return c.JSON(estimate)
}

func (api *API) calculateChargingEstimate(c fiber.Ctx, request chargingSessionRequest) (chargingEstimateResponse, error) {
	if strings.TrimSpace(request.VehicleID) == "" || request.TargetAt.IsZero() || !request.TargetAt.After(time.Now().UTC()) || request.TargetBatteryPercent > 100 || request.Latitude < -90 || request.Latitude > 90 || request.Longitude < -180 || request.Longitude > 180 {
		return chargingEstimateResponse{}, fiber.NewError(fiber.StatusBadRequest, "vehicle, battery targets, future target time, and valid location are required")
	}
	if api.chargingSessions == nil {
		return chargingEstimateResponse{}, fiber.NewError(fiber.StatusServiceUnavailable, "charging service is not configured")
	}
	vehicle, err := api.accounts.GetVehicle(c.Context(), currentUser(c).ID, strings.TrimSpace(request.VehicleID))
	if err != nil {
		return chargingEstimateResponse{}, resourceError(err)
	}
	if request.TargetBatteryPercent <= vehicle.CurrentBatteryPercent {
		return chargingEstimateResponse{}, fiber.NewError(fiber.StatusBadRequest, "target battery percentage must be greater than the current battery")
	}
	now := time.Now().UTC().Truncate(5 * time.Minute)
	horizon := int(mathCeilHours(request.TargetAt.Sub(now)))
	if horizon < 1 || horizon > 24 {
		return chargingEstimateResponse{}, fiber.NewError(fiber.StatusBadRequest, "target time must be within the next 24 hours")
	}
	forecast, err := api.carbonForecast.Forecast(c.Context(), request.Latitude, request.Longitude, horizon)
	if err != nil {
		return chargingEstimateResponse{}, upstreamError(err)
	}
	input := charging.PlanInput{Now: now, Deadline: request.TargetAt.UTC(), CurrentEnergyKWh: vehicle.BatteryCapacityKWh * vehicle.CurrentBatteryPercent / 100, TargetEnergyKWh: vehicle.BatteryCapacityKWh * request.TargetBatteryPercent / 100, Vehicle: charging.Vehicle{BatteryCapacityKWh: vehicle.BatteryCapacityKWh, MaxChargePowerKW: vehicle.ACChargingPowerKW, ChargingEfficiency: vehicle.ChargingEfficiency}}
	plan, err := charging.BuildPlan(input, forecast.Points)
	if errors.Is(err, charging.ErrInfeasible) {
		return chargingEstimateResponse{}, fiber.NewError(fiber.StatusUnprocessableEntity, err.Error())
	}
	if err != nil {
		return chargingEstimateResponse{}, fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	optimized, immediate, savings := charging.EstimateCarbonSavings(input, forecast.Points, plan)
	return chargingEstimateResponse{OptimizedEmissionsGCO2: optimized, ImmediateEmissionsGCO2: immediate, CarbonSavingsGCO2: savings}, nil
}

func (api *API) getActiveChargingSession(c fiber.Ctx) error {
	vehicleID := strings.TrimSpace(c.Query("vehicleId"))
	if vehicleID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "vehicleId is required")
	}
	if api.chargingSessions == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "charging service is not configured")
	}
	session, err := api.chargingSessions.GetActiveChargingSession(c.Context(), currentUser(c).ID, vehicleID)
	if errors.Is(err, account.ErrNotFound) {
		return c.JSON(fiber.Map{"chargingSession": nil})
	}
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"chargingSession": session})
}

func (api *API) stopChargingSession(c fiber.Ctx) error {
	if api.chargingSessions == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "charging service is not configured")
	}
	session, err := api.chargingSessions.StopChargingSession(c.Context(), currentUser(c).ID, c.Params("sessionId"), time.Now().UTC())
	if err != nil {
		return resourceError(err)
	}
	return c.JSON(session)
}

func (api *API) forceTopUpChargingSession(c fiber.Ctx) error {
	if api.chargingSessions == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "charging service is not configured")
	}
	session, err := api.chargingSessions.ForceTopUpChargingSession(c.Context(), currentUser(c).ID, c.Params("sessionId"))
	if err != nil {
		return resourceError(err)
	}
	return c.JSON(session)
}

func (api *API) disableForceTopUpChargingSession(c fiber.Ctx) error {
	if api.chargingSessions == nil {
		return fiber.NewError(fiber.StatusServiceUnavailable, "charging service is not configured")
	}
	session, err := api.chargingSessions.DisableForceTopUpChargingSession(c.Context(), currentUser(c).ID, c.Params("sessionId"))
	if err != nil {
		return resourceError(err)
	}
	return c.JSON(session)
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
	for _, connectorType := range vehicle.ConnectorTypes {
		if connectorType == "" {
			return errors.New("connector types cannot be empty")
		}
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
