package charging

import (
	"context"
	"log/slog"
	"math"
	"time"

	"github.com/ecov-charge/ecov-charge/apps/server/internal/account"
)

// SessionStore keeps the scheduler independent from the PostgreSQL implementation.
type SessionStore interface {
	ListRunnableChargingSessions(context.Context, time.Time) ([]account.ChargingSession, error)
	GetVehicle(context.Context, string, string) (account.Vehicle, error)
	ApplyChargingSessionTick(context.Context, string, account.ChargingSessionTick, bool) (account.ChargingSession, error)
}

type ForecastProvider interface {
	Forecast(context.Context, float64, float64, int) (Forecast, error)
}

type Scheduler struct {
	Store    SessionStore
	Forecast ForecastProvider
	Logger   *slog.Logger
}

// Run evaluates immediately, then at each five-minute boundary until ctx is cancelled.
func (scheduler Scheduler) Run(ctx context.Context) {
	scheduler.RunOnce(ctx, time.Now().UTC())
	for {
		now := time.Now().UTC()
		next := now.Truncate(5 * time.Minute).Add(5 * time.Minute)
		timer := time.NewTimer(time.Until(next))
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
			scheduler.RunOnce(ctx, time.Now().UTC())
		}
	}
}

func (scheduler Scheduler) RunOnce(ctx context.Context, current time.Time) {
	if scheduler.Store == nil || scheduler.Forecast == nil {
		return
	}
	now := current.UTC().Truncate(5 * time.Minute)
	sessions, err := scheduler.Store.ListRunnableChargingSessions(ctx, now)
	if err != nil {
		scheduler.log("list active charging sessions", err)
		return
	}
	for _, session := range sessions {
		scheduler.runSession(ctx, session, now)
	}
}

func (scheduler Scheduler) runSession(ctx context.Context, session account.ChargingSession, now time.Time) {
	if !now.Before(session.TargetAt) || session.CurrentBatteryPercent >= session.TargetBatteryPercent {
		_, err := scheduler.Store.ApplyChargingSessionTick(ctx, session.ID, account.ChargingSessionTick{ControlledAt: now}, true)
		if err != nil {
			scheduler.log("finish charging session", err)
		}
		return
	}
	vehicle, err := scheduler.Store.GetVehicle(ctx, session.UserID, session.VehicleID)
	if err != nil {
		scheduler.log("load charging vehicle", err)
		return
	}
	hours := int(math.Ceil(session.TargetAt.Sub(now).Hours()))
	if hours < 1 {
		hours = 1
	}
	if hours > 24 {
		hours = 24
	}
	forecast, err := scheduler.Forecast.Forecast(ctx, session.Latitude, session.Longitude, hours)
	if err != nil {
		scheduler.log("load carbon forecast", err)
		return
	}
	input := PlanInput{Now: now, Deadline: session.TargetAt, CurrentEnergyKWh: vehicle.BatteryCapacityKWh * session.CurrentBatteryPercent / 100, TargetEnergyKWh: vehicle.BatteryCapacityKWh * session.TargetBatteryPercent / 100, Vehicle: Vehicle{BatteryCapacityKWh: vehicle.BatteryCapacityKWh, MaxChargePowerKW: vehicle.ACChargingPowerKW, ChargingEfficiency: vehicle.ChargingEfficiency}}
	plan, err := BuildPlan(input, forecast.Points)
	if err != nil {
		scheduler.log("build charging plan", err)
		return
	}
	tick := account.ChargingSessionTick{ControlledAt: now}
	tick.EstimatedOptimizedEmissionsGCO2, tick.EstimatedImmediateEmissionsGCO2, tick.EstimatedCarbonSavingsGCO2 = EstimateCarbonSavings(input, forecast.Points, plan)
	var currentCarbonIntensity *float64
	for _, point := range forecast.Points {
		if !point.Datetime.Before(now) {
			value := point.CarbonIntensity
			currentCarbonIntensity = &value
			break
		}
	}
	totalBaselineBatteryEnergy := vehicle.BatteryCapacityKWh * (session.TargetBatteryPercent - session.InitialBatteryPercent) / 100
	baselineRemaining := math.Max(0, totalBaselineBatteryEnergy-session.AccumulatedBaselineBatteryEnergyKWh)
	tick.BaselineBatteryEnergyKWh = math.Min(baselineRemaining, vehicle.ACChargingPowerKW*vehicle.ChargingEfficiency*(5.0/60.0))
	tick.BaselineGridEnergyKWh = tick.BaselineBatteryEnergyKWh / vehicle.ChargingEfficiency
	if currentCarbonIntensity != nil {
		tick.BaselineEmissionsGCO2 = *currentCarbonIntensity * tick.BaselineGridEnergyKWh
	}
	if session.ControlMode == "force" {
		tick.EstimatedOptimizedEmissionsGCO2 = tick.EstimatedImmediateEmissionsGCO2
		tick.EstimatedCarbonSavingsGCO2 = 0
		remaining := input.TargetEnergyKWh - input.CurrentEnergyKWh
		tick.BatteryEnergyKWh = math.Min(remaining, vehicle.ACChargingPowerKW*vehicle.ChargingEfficiency*(5.0/60.0))
		tick.GridEnergyKWh = tick.BatteryEnergyKWh / vehicle.ChargingEfficiency
		tick.ChargingPowerKW = tick.GridEnergyKWh / (5.0 / 60.0)
		if currentCarbonIntensity != nil {
			tick.CarbonIntensity = currentCarbonIntensity
			tick.EmissionsGCO2 = *currentCarbonIntensity * tick.GridEnergyKWh
		}
	} else {
		for _, slot := range plan.Slots {
			if slot.Datetime.Equal(now) {
				value := slot.CarbonIntensity
				tick.CarbonIntensity = &value
				tick.ChargingPowerKW = slot.ChargingPowerKW
				tick.BatteryEnergyKWh = slot.BatteryEnergyKWh
				tick.GridEnergyKWh = slot.GridEnergyKWh
				tick.EmissionsGCO2 = slot.EstimatedCO2G
				break
			}
		}
	}
	tick.BatteryPercentGain = tick.BatteryEnergyKWh / vehicle.BatteryCapacityKWh * 100
	completed := session.CurrentBatteryPercent+tick.BatteryPercentGain >= session.TargetBatteryPercent-1e-7
	_, err = scheduler.Store.ApplyChargingSessionTick(ctx, session.ID, tick, completed)
	if err != nil {
		scheduler.log("save charging simulation tick", err)
	}
}

func (scheduler Scheduler) log(message string, err error) {
	if scheduler.Logger != nil {
		scheduler.Logger.Error(message, "error", err)
	}
}
