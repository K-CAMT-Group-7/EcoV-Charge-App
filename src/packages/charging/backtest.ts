import type { CarbonIntensity } from '../electricitymaps/api';

export interface BacktestVehicle {
  batteryCapacityKwh: number;
  maxChargePowerKw: number;
  chargingEfficiency: number;
}

export interface ChargingScenario {
  id: number;
  startIndex: number;
  endIndexExclusive: number;
  startSocPercent: number;
  targetSocPercent: number;
}

export interface SlotCharge {
  datetime: string;
  carbonIntensity: number;
  gridEnergyKwh: number;
  batteryEnergyKwh: number;
  emissionsGco2: number;
}

export interface StrategyResult {
  completed: boolean;
  deliveredBatteryEnergyKwh: number;
  gridEnergyKwh: number;
  emissionsGco2: number;
  averageCarbonIntensity: number;
  charges: SlotCharge[];
}

export interface ScenarioResult {
  scenario: ChargingScenario;
  requiredBatteryEnergyKwh: number;
  availableHours: number;
  baseline: StrategyResult;
  optimized: StrategyResult;
  emissionsSavedGco2: number;
  emissionsSavingsPercent: number;
}

export interface BacktestSummary {
  runs: number;
  completedBaseline: number;
  completedOptimized: number;
  baselineEmissionsGco2: number;
  optimizedEmissionsGco2: number;
  emissionsSavedGco2: number;
  emissionsSavingsPercent: number;
  averageSavingsPercent: number;
  medianSavingsPercent: number;
  minSavingsPercent: number;
  maxSavingsPercent: number;
}

const EPSILON = 1e-9;

export function inferSlotHours(points: CarbonIntensity[]): number {
  if (points.length < 2) throw new Error('At least two carbon-intensity points are required.');
  const differences = points
    .slice(1)
    .map((point, index) => Date.parse(point.datetime) - Date.parse(points[index].datetime))
    .filter((difference) => Number.isFinite(difference) && difference > 0)
    .toSorted((left, right) => left - right);
  if (!differences.length) throw new Error('Carbon-intensity timestamps must increase.');
  return differences[Math.floor(differences.length / 2)] / 3_600_000;
}

export function generateScenarios(
  pointCount: number,
  vehicle: BacktestVehicle,
  slotHours: number,
  runs = 100,
  seed = 20_260_812,
): ChargingScenario[] {
  if (pointCount < 25) throw new Error('At least 25 carbon-intensity points are required.');
  if (!Number.isInteger(runs) || runs <= 0) throw new Error('runs must be a positive integer.');

  const random = mulberry32(seed);
  const minWindowSlots = Math.min(24, pointCount);
  const maxWindowSlots = Math.min(144, pointCount);
  const batteryPerSlot = vehicle.maxChargePowerKw * vehicle.chargingEfficiency * slotHours;
  const scenarios: ChargingScenario[] = [];

  for (let id = 1; id <= runs; id += 1) {
    const windowSlots = randomInteger(random, minWindowSlots, maxWindowSlots);
    const startIndex = randomInteger(random, 0, pointCount - windowSlots);
    const startSocPercent = randomInteger(random, 10, 65);
    const windowUtilization = 0.25 + random() * 0.6;
    const desiredEnergy = windowSlots * batteryPerSlot * windowUtilization;
    const batteryHeadroom = (vehicle.batteryCapacityKwh * (90 - startSocPercent)) / 100;
    const requiredEnergy = Math.min(desiredEnergy, batteryHeadroom);
    const targetSocPercent = startSocPercent + (requiredEnergy / vehicle.batteryCapacityKwh) * 100;

    scenarios.push({
      id,
      startIndex,
      endIndexExclusive: startIndex + windowSlots,
      startSocPercent,
      targetSocPercent,
    });
  }

  return scenarios;
}

export function runScenario(
  points: CarbonIntensity[],
  vehicle: BacktestVehicle,
  scenario: ChargingScenario,
  slotHours = inferSlotHours(points),
): ScenarioResult {
  validateVehicle(vehicle);
  const available = points.slice(scenario.startIndex, scenario.endIndexExclusive);
  if (!available.length) throw new Error(`Scenario ${scenario.id} has no available slots.`);

  const requiredBatteryEnergyKwh =
    (vehicle.batteryCapacityKwh * (scenario.targetSocPercent - scenario.startSocPercent)) / 100;
  if (requiredBatteryEnergyKwh <= 0) {
    throw new Error(`Scenario ${scenario.id} target SOC must exceed start SOC.`);
  }

  // Baseline: start immediately and charge continuously.
  const baseline = simulateStrategy(
    available.map((_, index) => index),
    available,
    vehicle,
    requiredBatteryEnergyKwh,
    slotHours,
  );

  // Optimized formula: allocate energy to the lowest-carbon slots first.
  const optimizedOrder = available
    .map((point, index) => ({ index, carbonIntensity: point.carbonIntensity }))
    .toSorted(
      (left, right) => left.carbonIntensity - right.carbonIntensity || left.index - right.index,
    )
    .map(({ index }) => index);
  const optimized = simulateStrategy(
    optimizedOrder,
    available,
    vehicle,
    requiredBatteryEnergyKwh,
    slotHours,
  );

  const emissionsSavedGco2 = baseline.emissionsGco2 - optimized.emissionsGco2;
  const emissionsSavingsPercent =
    baseline.emissionsGco2 > 0 ? (emissionsSavedGco2 / baseline.emissionsGco2) * 100 : 0;

  return {
    scenario,
    requiredBatteryEnergyKwh,
    availableHours: available.length * slotHours,
    baseline,
    optimized,
    emissionsSavedGco2,
    emissionsSavingsPercent,
  };
}

export function summarizeBacktest(results: ScenarioResult[]): BacktestSummary {
  if (!results.length) throw new Error('At least one scenario result is required.');
  const savings = results
    .map((result) => result.emissionsSavingsPercent)
    .toSorted((left, right) => left - right);
  const baselineEmissionsGco2 = sum(results.map((result) => result.baseline.emissionsGco2));
  const optimizedEmissionsGco2 = sum(results.map((result) => result.optimized.emissionsGco2));
  const emissionsSavedGco2 = baselineEmissionsGco2 - optimizedEmissionsGco2;

  return {
    runs: results.length,
    completedBaseline: results.filter((result) => result.baseline.completed).length,
    completedOptimized: results.filter((result) => result.optimized.completed).length,
    baselineEmissionsGco2,
    optimizedEmissionsGco2,
    emissionsSavedGco2,
    emissionsSavingsPercent:
      baselineEmissionsGco2 > 0 ? (emissionsSavedGco2 / baselineEmissionsGco2) * 100 : 0,
    averageSavingsPercent: sum(savings) / savings.length,
    medianSavingsPercent: percentile(savings, 0.5),
    minSavingsPercent: savings[0],
    maxSavingsPercent: savings[savings.length - 1],
  };
}

function simulateStrategy(
  slotOrder: number[],
  points: CarbonIntensity[],
  vehicle: BacktestVehicle,
  requiredBatteryEnergyKwh: number,
  slotHours: number,
): StrategyResult {
  const maxGridEnergyPerSlot = vehicle.maxChargePowerKw * slotHours;
  let remainingBatteryEnergy = requiredBatteryEnergyKwh;
  const charges: SlotCharge[] = [];

  for (const index of slotOrder) {
    if (remainingBatteryEnergy <= EPSILON) break;
    const point = points[index];
    const requiredGridEnergy = remainingBatteryEnergy / vehicle.chargingEfficiency;
    const gridEnergyKwh = Math.min(maxGridEnergyPerSlot, requiredGridEnergy);
    const batteryEnergyKwh = gridEnergyKwh * vehicle.chargingEfficiency;
    charges.push({
      datetime: point.datetime,
      carbonIntensity: point.carbonIntensity,
      gridEnergyKwh,
      batteryEnergyKwh,
      emissionsGco2: point.carbonIntensity * gridEnergyKwh,
    });
    remainingBatteryEnergy -= batteryEnergyKwh;
  }

  const deliveredBatteryEnergyKwh = sum(charges.map((charge) => charge.batteryEnergyKwh));
  const gridEnergyKwh = sum(charges.map((charge) => charge.gridEnergyKwh));
  const emissionsGco2 = sum(charges.map((charge) => charge.emissionsGco2));

  return {
    completed: remainingBatteryEnergy <= EPSILON,
    deliveredBatteryEnergyKwh,
    gridEnergyKwh,
    emissionsGco2,
    averageCarbonIntensity: gridEnergyKwh > 0 ? emissionsGco2 / gridEnergyKwh : 0,
    charges: charges.toSorted(
      (left, right) => Date.parse(left.datetime) - Date.parse(right.datetime),
    ),
  };
}

function validateVehicle(vehicle: BacktestVehicle) {
  if (vehicle.batteryCapacityKwh <= 0 || vehicle.maxChargePowerKw <= 0) {
    throw new Error('Vehicle capacity and charging power must be positive.');
  }
  if (vehicle.chargingEfficiency <= 0 || vehicle.chargingEfficiency > 1) {
    throw new Error('Vehicle charging efficiency must be in the range (0, 1].');
  }
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function randomInteger(random: () => number, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(sortedValues: number[], ratio: number) {
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}
