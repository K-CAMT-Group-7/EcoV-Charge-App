package charging

import (
	"context"
	"testing"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
)

type schedulerStore struct {
	session   account.ChargingSession
	tick      account.ChargingSessionTick
	completed bool
}

func (store *schedulerStore) ListRunnableChargingSessions(context.Context, time.Time) ([]account.ChargingSession, error) {
	return []account.ChargingSession{store.session}, nil
}
func (store *schedulerStore) GetVehicle(context.Context, string, string) (account.Vehicle, error) {
	return account.Vehicle{BatteryCapacityKWh: 100, ACChargingPowerKW: 12, ChargingEfficiency: 1}, nil
}
func (store *schedulerStore) ApplyChargingSessionTick(_ context.Context, _ string, tick account.ChargingSessionTick, completed bool) (account.ChargingSession, error) {
	store.tick = tick
	store.completed = completed
	return store.session, nil
}

type schedulerForecast struct{ points []CarbonPoint }

func (forecast schedulerForecast) Forecast(context.Context, float64, float64, int) (Forecast, error) {
	return Forecast{Points: forecast.points}, nil
}

func TestSchedulerSimulatesSelectedFiveMinuteSlot(t *testing.T) {
	now := time.Date(2026, time.August, 13, 10, 0, 0, 0, time.UTC)
	points := make([]CarbonPoint, 72)
	for index := range points {
		points[index] = CarbonPoint{Datetime: now.Add(time.Duration(index) * 5 * time.Minute), CarbonIntensity: 100}
	}
	store := &schedulerStore{session: account.ChargingSession{ID: "session", UserID: "user", VehicleID: "vehicle", StartedAt: now, TargetAt: now.Add(6 * time.Hour), CurrentBatteryPercent: 30, TargetBatteryPercent: 31}}
	Scheduler{Store: store, Forecast: schedulerForecast{points: points}}.RunOnce(context.Background(), now)
	if store.tick.ChargingPowerKW != 12 || store.tick.BatteryEnergyKWh != 1 || !store.completed {
		t.Fatalf("unexpected simulated tick: %#v, completed=%v", store.tick, store.completed)
	}
}

func TestSchedulerForceTopUpChargesCurrentSlotRegardlessOfCarbonRanking(t *testing.T) {
	now := time.Date(2026, time.August, 13, 10, 0, 0, 0, time.UTC)
	points := make([]CarbonPoint, 72)
	for index := range points {
		points[index] = CarbonPoint{Datetime: now.Add(time.Duration(index) * 5 * time.Minute), CarbonIntensity: 10}
	}
	points[0].CarbonIntensity = 900
	store := &schedulerStore{session: account.ChargingSession{ID: "session", UserID: "user", VehicleID: "vehicle", Status: "charging", ControlMode: "force", StartedAt: now, TargetAt: now.Add(6 * time.Hour), CurrentBatteryPercent: 30, TargetBatteryPercent: 40}}
	Scheduler{Store: store, Forecast: schedulerForecast{points: points}}.RunOnce(context.Background(), now)
	if store.tick.ChargingPowerKW != 12 || store.tick.BatteryEnergyKWh != 1 {
		t.Fatalf("force top up did not charge immediately: %#v", store.tick)
	}
	if store.tick.CarbonIntensity == nil || *store.tick.CarbonIntensity != 900 {
		t.Fatalf("force top up did not use current slot carbon intensity: %#v", store.tick)
	}
	if store.tick.EstimatedCarbonSavingsGCO2 != 0 {
		t.Fatalf("force top up must not claim carbon savings: %#v", store.tick)
	}
}

func TestSchedulerRecordsImmediateChargingBaselineDuringSmartPause(t *testing.T) {
	now := time.Date(2026, time.August, 13, 10, 0, 0, 0, time.UTC)
	points := make([]CarbonPoint, 72)
	for index := range points {
		points[index] = CarbonPoint{Datetime: now.Add(time.Duration(index) * 5 * time.Minute), CarbonIntensity: 10}
	}
	points[0].CarbonIntensity = 900
	store := &schedulerStore{session: account.ChargingSession{ID: "session", UserID: "user", VehicleID: "vehicle", Status: "scheduled", ControlMode: "smart", StartedAt: now, TargetAt: now.Add(6 * time.Hour), InitialBatteryPercent: 30, CurrentBatteryPercent: 30, TargetBatteryPercent: 31}}
	Scheduler{Store: store, Forecast: schedulerForecast{points: points}}.RunOnce(context.Background(), now)
	if store.tick.BatteryEnergyKWh != 0 || store.tick.EmissionsGCO2 != 0 {
		t.Fatalf("smart plan should pause during dirty slot: %#v", store.tick)
	}
	if store.tick.BaselineBatteryEnergyKWh != 1 || store.tick.BaselineEmissionsGCO2 != 900 {
		t.Fatalf("immediate baseline was not recorded: %#v", store.tick)
	}
}
