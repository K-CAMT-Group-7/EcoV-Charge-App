package account

import "time"

type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	AvatarURL   *string   `json:"avatarUrl"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type GoogleIdentity struct {
	Subject       string
	Email         string
	EmailVerified bool
	DisplayName   string
	AvatarURL     string
}

type Session struct {
	ID        string
	UserID    string
	ExpiresAt time.Time
}

type Vehicle struct {
	ID                    string    `json:"id"`
	UserID                string    `json:"userId"`
	DisplayName           string    `json:"displayName"`
	Manufacturer          string    `json:"manufacturer"`
	Model                 string    `json:"model"`
	ModelYear             int       `json:"modelYear"`
	BatteryCapacityKWh    float64   `json:"batteryCapacityKwh"`
	ACChargingPowerKW     float64   `json:"acChargingPowerKw"`
	DCFastChargingPowerKW float64   `json:"dcFastChargingPowerKw"`
	ChargingEfficiency    float64   `json:"chargingEfficiency"`
	CurrentBatteryPercent float64   `json:"currentBatteryPercent"`
	ConnectorTypes        []string  `json:"connectorTypes"`
	CreatedAt             time.Time `json:"createdAt"`
	UpdatedAt             time.Time `json:"updatedAt"`
}

type ChargingRecord struct {
	ID                     string    `json:"id"`
	UserID                 string    `json:"userId"`
	VehicleID              string    `json:"vehicleId"`
	StartedAt              time.Time `json:"startedAt"`
	EndedAt                time.Time `json:"endedAt"`
	StartBatteryPercent    float64   `json:"startBatteryPercent"`
	EndBatteryPercent      float64   `json:"endBatteryPercent"`
	BatteryEnergyKWh       float64   `json:"batteryEnergyKwh"`
	GridEnergyKWh          *float64  `json:"gridEnergyKwh"`
	AverageCarbonIntensity *float64  `json:"averageCarbonIntensity"`
	EmissionsGCO2          *float64  `json:"emissionsGco2"`
	CreatedAt              time.Time `json:"createdAt"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

type ChargingSession struct {
	ID                              string     `json:"id"`
	UserID                          string     `json:"userId"`
	VehicleID                       string     `json:"vehicleId"`
	Status                          string     `json:"status"`
	StartedAt                       time.Time  `json:"startedAt"`
	TargetAt                        time.Time  `json:"targetAt"`
	InitialBatteryPercent           float64    `json:"initialBatteryPercent"`
	CurrentBatteryPercent           float64    `json:"currentBatteryPercent"`
	TargetBatteryPercent            float64    `json:"targetBatteryPercent"`
	Latitude                        float64    `json:"latitude"`
	Longitude                       float64    `json:"longitude"`
	AccumulatedBatteryEnergyKWh     float64    `json:"accumulatedBatteryEnergyKwh"`
	AccumulatedGridEnergyKWh        float64    `json:"accumulatedGridEnergyKwh"`
	AccumulatedEmissionsGCO2        float64    `json:"accumulatedEmissionsGco2"`
	EstimatedOptimizedEmissionsGCO2 float64    `json:"estimatedOptimizedEmissionsGco2"`
	EstimatedImmediateEmissionsGCO2 float64    `json:"estimatedImmediateEmissionsGco2"`
	EstimatedCarbonSavingsGCO2      float64    `json:"estimatedCarbonSavingsGco2"`
	LastControlledAt                *time.Time `json:"lastControlledAt"`
	CompletedAt                     *time.Time `json:"completedAt"`
	CreatedAt                       time.Time  `json:"createdAt"`
	UpdatedAt                       time.Time  `json:"updatedAt"`
}

type ChargingSessionTick struct {
	ControlledAt                    time.Time `json:"controlledAt"`
	ChargingPowerKW                 float64   `json:"chargingPowerKw"`
	BatteryEnergyKWh                float64   `json:"batteryEnergyKwh"`
	GridEnergyKWh                   float64   `json:"gridEnergyKwh"`
	CarbonIntensity                 *float64  `json:"carbonIntensity"`
	EmissionsGCO2                   float64   `json:"emissionsGco2"`
	BatteryPercentGain              float64   `json:"-"`
	EstimatedOptimizedEmissionsGCO2 float64   `json:"-"`
	EstimatedImmediateEmissionsGCO2 float64   `json:"-"`
	EstimatedCarbonSavingsGCO2      float64   `json:"-"`
}
