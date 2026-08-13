package charging

import (
	"fmt"
	"math"
	"math/rand"
	"slices"
	"time"
)

type Scenario struct {
	ID                int     `json:"id"`
	StartIndex        int     `json:"startIndex"`
	EndIndexExclusive int     `json:"endIndexExclusive"`
	StartSOCPercent   float64 `json:"startSocPercent"`
	TargetSOCPercent  float64 `json:"targetSocPercent"`
}

type StrategyResult struct {
	Completed              bool    `json:"completed"`
	GridEnergyKWh          float64 `json:"gridEnergyKwh"`
	BatteryEnergyKWh       float64 `json:"batteryEnergyKwh"`
	EmissionsGCO2          float64 `json:"emissionsGco2"`
	AverageCarbonIntensity float64 `json:"averageCarbonIntensity"`
}

type ScenarioResult struct {
	Scenario                Scenario       `json:"scenario"`
	RequiredEnergyKWh       float64        `json:"requiredEnergyKwh"`
	AvailableHours          float64        `json:"availableHours"`
	Baseline                StrategyResult `json:"baseline"`
	Optimized               StrategyResult `json:"optimized"`
	EmissionsSavedGCO2      float64        `json:"emissionsSavedGco2"`
	EmissionsSavingsPercent float64        `json:"emissionsSavingsPercent"`
}

type BacktestSummary struct {
	Runs                    int     `json:"runs"`
	CompletedBaseline       int     `json:"completedBaseline"`
	CompletedOptimized      int     `json:"completedOptimized"`
	BaselineEmissionsGCO2   float64 `json:"baselineEmissionsGco2"`
	OptimizedEmissionsGCO2  float64 `json:"optimizedEmissionsGco2"`
	EmissionsSavedGCO2      float64 `json:"emissionsSavedGco2"`
	EmissionsSavingsPercent float64 `json:"emissionsSavingsPercent"`
	AverageSavingsPercent   float64 `json:"averageSavingsPercent"`
	MedianSavingsPercent    float64 `json:"medianSavingsPercent"`
	MinSavingsPercent       float64 `json:"minSavingsPercent"`
	MaxSavingsPercent       float64 `json:"maxSavingsPercent"`
}

type Backtest struct {
	Summary   BacktestSummary  `json:"summary"`
	Scenarios []ScenarioResult `json:"scenarios"`
}

func RunBacktest(points []CarbonPoint, vehicle Vehicle, runs int, seed int64) (Backtest, error) {
	if runs <= 0 || runs > 10_000 {
		return Backtest{}, fmt.Errorf("runs must be between 1 and 10000")
	}
	if err := validateVehicle(vehicle); err != nil {
		return Backtest{}, err
	}
	if len(points) < 25 {
		return Backtest{}, fmt.Errorf("at least 25 carbon forecast points are required")
	}
	points = slices.Clone(points)
	slices.SortFunc(points, func(a, b CarbonPoint) int { return a.Datetime.Compare(b.Datetime) })
	slotDuration := medianSlotDuration(points)
	if slotDuration <= 0 {
		return Backtest{}, fmt.Errorf("carbon forecast timestamps must increase")
	}

	random := rand.New(rand.NewSource(seed))
	minWindow := min(24, len(points))
	maxWindow := min(144, len(points))
	batteryPerSlot := vehicle.MaxChargePowerKW * vehicle.ChargingEfficiency * slotDuration.Hours()
	results := make([]ScenarioResult, 0, runs)

	for id := 1; id <= runs; id++ {
		windowSlots := randomIntInclusive(random, minWindow, maxWindow)
		startIndex := randomIntInclusive(random, 0, len(points)-windowSlots)
		startSOC := float64(randomIntInclusive(random, 10, 65))
		windowUtilization := 0.25 + random.Float64()*0.6
		desiredEnergy := float64(windowSlots) * batteryPerSlot * windowUtilization
		batteryHeadroom := vehicle.BatteryCapacityKWh * (90 - startSOC) / 100
		requiredEnergy := math.Min(desiredEnergy, batteryHeadroom)
		targetSOC := startSOC + requiredEnergy/vehicle.BatteryCapacityKWh*100

		scenario := Scenario{
			ID:                id,
			StartIndex:        startIndex,
			EndIndexExclusive: startIndex + windowSlots,
			StartSOCPercent:   startSOC,
			TargetSOCPercent:  targetSOC,
		}
		result := runBacktestScenario(points, vehicle, scenario, slotDuration)
		results = append(results, result)
	}

	return Backtest{Summary: summarize(results), Scenarios: results}, nil
}

func runBacktestScenario(
	points []CarbonPoint,
	vehicle Vehicle,
	scenario Scenario,
	slotDuration time.Duration,
) ScenarioResult {
	available := points[scenario.StartIndex:scenario.EndIndexExclusive]
	required := vehicle.BatteryCapacityKWh *
		(scenario.TargetSOCPercent - scenario.StartSOCPercent) / 100
	baselineOrder := make([]int, len(available))
	for index := range baselineOrder {
		baselineOrder[index] = index
	}
	optimizedOrder := slices.Clone(baselineOrder)
	slices.SortFunc(optimizedOrder, func(a, b int) int {
		if available[a].CarbonIntensity < available[b].CarbonIntensity {
			return -1
		}
		if available[a].CarbonIntensity > available[b].CarbonIntensity {
			return 1
		}
		return a - b
	})

	baseline := simulate(available, baselineOrder, vehicle, required, slotDuration)
	optimized := simulate(available, optimizedOrder, vehicle, required, slotDuration)
	saved := baseline.EmissionsGCO2 - optimized.EmissionsGCO2
	percent := 0.0
	if baseline.EmissionsGCO2 > 0 {
		percent = saved / baseline.EmissionsGCO2 * 100
	}
	return ScenarioResult{
		Scenario:                scenario,
		RequiredEnergyKWh:       required,
		AvailableHours:          float64(len(available)) * slotDuration.Hours(),
		Baseline:                baseline,
		Optimized:               optimized,
		EmissionsSavedGCO2:      saved,
		EmissionsSavingsPercent: percent,
	}
}

func simulate(
	points []CarbonPoint,
	order []int,
	vehicle Vehicle,
	requiredBatteryEnergy float64,
	slotDuration time.Duration,
) StrategyResult {
	remaining := requiredBatteryEnergy
	maxGridPerSlot := vehicle.MaxChargePowerKW * slotDuration.Hours()
	result := StrategyResult{}
	for _, index := range order {
		if remaining <= 1e-9 {
			break
		}
		gridEnergy := math.Min(maxGridPerSlot, remaining/vehicle.ChargingEfficiency)
		batteryEnergy := gridEnergy * vehicle.ChargingEfficiency
		result.GridEnergyKWh += gridEnergy
		result.BatteryEnergyKWh += batteryEnergy
		result.EmissionsGCO2 += gridEnergy * points[index].CarbonIntensity
		remaining -= batteryEnergy
	}
	result.Completed = remaining <= 1e-9
	if result.GridEnergyKWh > 0 {
		result.AverageCarbonIntensity = result.EmissionsGCO2 / result.GridEnergyKWh
	}
	return result
}

func summarize(results []ScenarioResult) BacktestSummary {
	summary := BacktestSummary{Runs: len(results)}
	savings := make([]float64, 0, len(results))
	for _, result := range results {
		if result.Baseline.Completed {
			summary.CompletedBaseline++
		}
		if result.Optimized.Completed {
			summary.CompletedOptimized++
		}
		summary.BaselineEmissionsGCO2 += result.Baseline.EmissionsGCO2
		summary.OptimizedEmissionsGCO2 += result.Optimized.EmissionsGCO2
		summary.AverageSavingsPercent += result.EmissionsSavingsPercent
		savings = append(savings, result.EmissionsSavingsPercent)
	}
	summary.EmissionsSavedGCO2 = summary.BaselineEmissionsGCO2 - summary.OptimizedEmissionsGCO2
	if summary.BaselineEmissionsGCO2 > 0 {
		summary.EmissionsSavingsPercent = summary.EmissionsSavedGCO2 / summary.BaselineEmissionsGCO2 * 100
	}
	if len(results) > 0 {
		summary.AverageSavingsPercent /= float64(len(results))
		slices.Sort(savings)
		summary.MinSavingsPercent = savings[0]
		summary.MaxSavingsPercent = savings[len(savings)-1]
		middle := len(savings) / 2
		if len(savings)%2 == 0 {
			summary.MedianSavingsPercent = (savings[middle-1] + savings[middle]) / 2
		} else {
			summary.MedianSavingsPercent = savings[middle]
		}
	}
	return summary
}

func validateVehicle(vehicle Vehicle) error {
	if vehicle.BatteryCapacityKWh <= 0 || vehicle.MaxChargePowerKW <= 0 {
		return fmt.Errorf("vehicle battery capacity and charging power must be positive")
	}
	if vehicle.ChargingEfficiency <= 0 || vehicle.ChargingEfficiency > 1 {
		return fmt.Errorf("charging efficiency must be in the range (0, 1]")
	}
	return nil
}

func randomIntInclusive(random *rand.Rand, minimum, maximum int) int {
	return minimum + random.Intn(maximum-minimum+1)
}
