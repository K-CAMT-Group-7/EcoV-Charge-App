package charging

import (
	"math"
	"testing"
	"time"
)

func TestBuildPlanSelectsLowestCarbonSlots(t *testing.T) {
	start := time.Date(2026, time.August, 12, 10, 0, 0, 0, time.UTC)
	intensities := []float64{400, 100, 300, 200}
	points := make([]CarbonPoint, len(intensities))
	for index, intensity := range intensities {
		points[index] = CarbonPoint{
			Datetime:        start.Add(time.Duration(index) * time.Hour),
			CarbonIntensity: intensity,
		}
	}

	plan, err := BuildPlan(PlanInput{
		Now:              start,
		Deadline:         start.Add(4 * time.Hour),
		CurrentEnergyKWh: 12,
		TargetEnergyKWh:  30,
		Vehicle: Vehicle{
			BatteryCapacityKWh: 60,
			MaxChargePowerKW:   12,
			ChargingEfficiency: 1,
		},
	}, points)
	if err != nil {
		t.Fatalf("BuildPlan returned an error: %v", err)
	}

	if len(plan.Slots) != 2 {
		t.Fatalf("expected 2 selected slots, got %d", len(plan.Slots))
	}
	if plan.Slots[0].CarbonIntensity != 100 || plan.Slots[1].CarbonIntensity != 200 {
		t.Fatalf("unexpected selected intensities: %+v", plan.Slots)
	}
	if !almostEqual(plan.EstimatedCO2G, 2_400) {
		t.Fatalf("expected 2400 gCO2, got %f", plan.EstimatedCO2G)
	}
	if !almostEqual(plan.Slots[1].GridEnergyKWh, 6) {
		t.Fatalf("expected a 6 kWh partial final slot, got %f", plan.Slots[1].GridEnergyKWh)
	}
}

func TestBuildPlanRejectsInfeasibleTarget(t *testing.T) {
	start := time.Date(2026, time.August, 12, 10, 0, 0, 0, time.UTC)
	points := []CarbonPoint{
		{Datetime: start, CarbonIntensity: 100},
		{Datetime: start.Add(5 * time.Minute), CarbonIntensity: 90},
	}
	_, err := BuildPlan(PlanInput{
		Now:              start,
		Deadline:         start.Add(10 * time.Minute),
		CurrentEnergyKWh: 10,
		TargetEnergyKWh:  20,
		Vehicle: Vehicle{
			BatteryCapacityKWh: 60,
			MaxChargePowerKW:   7,
			ChargingEfficiency: 0.9,
		},
	}, points)
	if err != ErrInfeasible {
		t.Fatalf("expected ErrInfeasible, got %v", err)
	}
}

func TestRunBacktestCompletesAndNeverIncreasesEmissions(t *testing.T) {
	start := time.Date(2026, time.August, 12, 0, 0, 0, 0, time.UTC)
	points := make([]CarbonPoint, 300)
	for index := range points {
		points[index] = CarbonPoint{
			Datetime:        start.Add(time.Duration(index) * 5 * time.Minute),
			CarbonIntensity: 350 + 120*math.Sin(float64(index)/18),
		}
	}
	result, err := RunBacktest(points, Vehicle{
		BatteryCapacityKWh: 79.7,
		MaxChargePowerKW:   11,
		ChargingEfficiency: 0.92,
	}, 100, 20_260_812)
	if err != nil {
		t.Fatalf("RunBacktest returned an error: %v", err)
	}
	if result.Summary.CompletedOptimized != 100 {
		t.Fatalf("expected 100 completed runs, got %d", result.Summary.CompletedOptimized)
	}
	for _, scenario := range result.Scenarios {
		if scenario.Optimized.EmissionsGCO2 > scenario.Baseline.EmissionsGCO2+1e-9 {
			t.Fatalf("scenario %d increased emissions", scenario.Scenario.ID)
		}
	}
}

func almostEqual(left, right float64) bool {
	return math.Abs(left-right) < 1e-9
}
