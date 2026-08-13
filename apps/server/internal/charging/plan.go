package charging

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"time"
)

var ErrInfeasible = errors.New("charging target cannot be reached before the deadline")

type CarbonPoint struct {
	Datetime        time.Time `json:"datetime"`
	CarbonIntensity float64   `json:"carbonIntensity"`
}

type Forecast struct {
	Zone   string        `json:"zone"`
	Points []CarbonPoint `json:"points"`
}

type Vehicle struct {
	BatteryCapacityKWh float64 `json:"batteryCapacityKwh"`
	MaxChargePowerKW   float64 `json:"maxChargePowerKw"`
	ChargingEfficiency float64 `json:"chargingEfficiency"`
}

type PlanInput struct {
	Now              time.Time `json:"now"`
	Deadline         time.Time `json:"deadline"`
	CurrentEnergyKWh float64   `json:"currentEnergyKwh"`
	TargetEnergyKWh  float64   `json:"targetEnergyKwh"`
	Vehicle          Vehicle   `json:"vehicle"`
}

type PlanSlot struct {
	Datetime         time.Time `json:"datetime"`
	CarbonIntensity  float64   `json:"carbonIntensity"`
	ChargingPowerKW  float64   `json:"chargingPowerKw"`
	GridEnergyKWh    float64   `json:"gridEnergyKwh"`
	BatteryEnergyKWh float64   `json:"batteryEnergyKwh"`
	EstimatedCO2G    float64   `json:"estimatedCo2G"`
}

type Plan struct {
	RequiredEnergyKWh float64    `json:"requiredEnergyKwh"`
	PlannedEnergyKWh  float64    `json:"plannedEnergyKwh"`
	GridEnergyKWh     float64    `json:"gridEnergyKwh"`
	EstimatedCO2G     float64    `json:"estimatedCo2G"`
	CurrentPowerKW    float64    `json:"currentPowerKw"`
	Slots             []PlanSlot `json:"slots"`
}

func BuildPlan(input PlanInput, points []CarbonPoint) (Plan, error) {
	if err := validateInput(input); err != nil {
		return Plan{}, err
	}
	if len(points) < 2 {
		return Plan{}, fmt.Errorf("at least two carbon forecast points are required")
	}

	points = slices.Clone(points)
	slices.SortFunc(points, func(a, b CarbonPoint) int { return a.Datetime.Compare(b.Datetime) })
	slotDuration := medianSlotDuration(points)
	if slotDuration <= 0 {
		return Plan{}, fmt.Errorf("carbon forecast timestamps must increase")
	}

	available := make([]CarbonPoint, 0, len(points))
	for _, point := range points {
		if !point.Datetime.Before(input.Now) && point.Datetime.Before(input.Deadline) {
			available = append(available, point)
		}
	}
	if len(available) == 0 {
		return Plan{}, ErrInfeasible
	}

	required := math.Max(0, input.TargetEnergyKWh-input.CurrentEnergyKWh)
	if required == 0 {
		return Plan{Slots: []PlanSlot{}}, nil
	}
	slotHours := slotDuration.Hours()
	maxBatteryPerSlot := input.Vehicle.MaxChargePowerKW * input.Vehicle.ChargingEfficiency * slotHours
	if float64(len(available))*maxBatteryPerSlot+1e-9 < required {
		return Plan{}, ErrInfeasible
	}

	// Select the cleanest slots first. Sorting by time for ties makes plans stable.
	ranked := slices.Clone(available)
	slices.SortFunc(ranked, func(a, b CarbonPoint) int {
		if a.CarbonIntensity < b.CarbonIntensity {
			return -1
		}
		if a.CarbonIntensity > b.CarbonIntensity {
			return 1
		}
		return a.Datetime.Compare(b.Datetime)
	})

	remaining := required
	slots := make([]PlanSlot, 0, int(math.Ceil(required/maxBatteryPerSlot)))
	for _, point := range ranked {
		if remaining <= 1e-9 {
			break
		}
		batteryEnergy := math.Min(maxBatteryPerSlot, remaining)
		gridEnergy := batteryEnergy / input.Vehicle.ChargingEfficiency
		power := gridEnergy / slotHours
		slots = append(slots, PlanSlot{
			Datetime:         point.Datetime,
			CarbonIntensity:  point.CarbonIntensity,
			ChargingPowerKW:  power,
			GridEnergyKWh:    gridEnergy,
			BatteryEnergyKWh: batteryEnergy,
			EstimatedCO2G:    point.CarbonIntensity * gridEnergy,
		})
		remaining -= batteryEnergy
	}
	slices.SortFunc(slots, func(a, b PlanSlot) int { return a.Datetime.Compare(b.Datetime) })

	plan := Plan{RequiredEnergyKWh: required, Slots: slots}
	for _, slot := range slots {
		plan.PlannedEnergyKWh += slot.BatteryEnergyKWh
		plan.GridEnergyKWh += slot.GridEnergyKWh
		plan.EstimatedCO2G += slot.EstimatedCO2G
		if !slot.Datetime.After(input.Now) && input.Now.Before(slot.Datetime.Add(slotDuration)) {
			plan.CurrentPowerKW = slot.ChargingPowerKW
		}
	}
	return plan, nil
}

func validateInput(input PlanInput) error {
	if input.Now.IsZero() || input.Deadline.IsZero() || !input.Deadline.After(input.Now) {
		return fmt.Errorf("deadline must be later than now")
	}
	if input.Vehicle.BatteryCapacityKWh <= 0 || input.Vehicle.MaxChargePowerKW <= 0 {
		return fmt.Errorf("vehicle battery capacity and charging power must be positive")
	}
	if input.Vehicle.ChargingEfficiency <= 0 || input.Vehicle.ChargingEfficiency > 1 {
		return fmt.Errorf("charging efficiency must be in the range (0, 1]")
	}
	if input.CurrentEnergyKWh < 0 || input.TargetEnergyKWh < input.CurrentEnergyKWh ||
		input.TargetEnergyKWh > input.Vehicle.BatteryCapacityKWh {
		return fmt.Errorf("current and target energy must be within the battery capacity")
	}
	return nil
}

func medianSlotDuration(points []CarbonPoint) time.Duration {
	durations := make([]time.Duration, 0, len(points)-1)
	for index := 1; index < len(points); index++ {
		if duration := points[index].Datetime.Sub(points[index-1].Datetime); duration > 0 {
			durations = append(durations, duration)
		}
	}
	if len(durations) == 0 {
		return 0
	}
	slices.Sort(durations)
	return durations[len(durations)/2]
}
