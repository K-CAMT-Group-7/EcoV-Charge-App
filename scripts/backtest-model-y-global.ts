import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  runScenario,
  summarizeBacktest,
  type BacktestVehicle,
  type ScenarioResult,
} from '../src/packages/charging/backtest';
import type { CarbonIntensity } from '../src/packages/electricitymaps/api';

interface GridProfile {
  country: string;
  meanGco2PerKwh: number;
  dailyVariationGco2PerKwh: number;
}

interface CountryResult {
  country: string;
  runs: number;
  averageSavingsPercent: number;
  baselineCarbonIntensity: number;
  optimizedCarbonIntensity: number;
  annualBaselineKgco2: number;
  annualOptimizedKgco2: number;
  annualSavedKgco2: number;
}

const vehicle: BacktestVehicle = {
  batteryCapacityKwh: 79.7,
  maxChargePowerKw: 11,
  chargingEfficiency: 0.92,
};

// Representative national-grid profiles used when a live, location-specific forecast is unavailable.
// They are intentionally a scenario calibration, not a substitute for measured Electricity Maps data.
const profiles: GridProfile[] = [
  ['Norway', 30, 10],
  ['Sweden', 45, 14],
  ['France', 55, 18],
  ['Switzerland', 45, 14],
  ['Finland', 70, 24],
  ['Brazil', 85, 28],
  ['New Zealand', 100, 38],
  ['Canada', 120, 36],
  ['Austria', 120, 42],
  ['Belgium', 160, 45],
  ['Spain', 160, 72],
  ['Colombia', 170, 58],
  ['Portugal', 170, 76],
  ['Denmark', 180, 135],
  ['United Kingdom', 220, 62],
  ['Peru', 270, 50],
  ['Italy', 290, 70],
  ['Argentina', 300, 38],
  ['Chile', 350, 145],
  ['Germany', 380, 82],
  ['Netherlands', 380, 92],
  ['United States', 390, 78],
  ['Singapore', 410, 22],
  ['Greece', 420, 96],
  ['Mexico', 430, 40],
  ['South Korea', 440, 38],
  ['Turkey', 450, 66],
  ['United Arab Emirates', 450, 24],
  ['Vietnam', 450, 88],
  ['Japan', 460, 32],
  ['Thailand', 500, 46],
  ['Taiwan', 500, 44],
  ['China', 540, 68],
  ['Morocco', 600, 52],
  ['Saudi Arabia', 600, 26],
  ['Australia', 620, 128],
  ['Poland', 650, 52],
  ['India', 700, 72],
  ['Indonesia', 720, 38],
  ['South Africa', 900, 86],
].map(([country, meanGco2PerKwh, dailyVariationGco2PerKwh]) => ({
  country: String(country),
  meanGco2PerKwh: Number(meanGco2PerKwh),
  dailyVariationGco2PerKwh: Number(dailyVariationGco2PerKwh),
}));

const runs = readPositiveInteger('--runs', 500);
const seed = readPositiveInteger('--seed', 20260813);
const output = readArgument('--output') ?? 'reports/model-y-global-500-backtest.json';
const annualDistanceKm = readPositiveNumber('--annual-km', 15_000);
const homeChargingShare = readShare('--home-charging-share', 0.85);
const random = mulberry32(seed);
const results: ScenarioResult[] = [];
const resultsByCountry = new Map<string, ScenarioResult[]>();

for (let id = 1; id <= runs; id += 1) {
  const profile = profiles[(id - 1) % profiles.length];
  const points = buildWeek(profile, id, random);
  const startHour = 24 + randomInteger(random, 0, 23);
  const windowHours = randomInteger(random, 6, 14);
  const startSocPercent = randomInteger(random, 15, 60);
  const targetSocPercent = Math.min(90, startSocPercent + randomInteger(random, 25, 60));
  const result = runScenario(
    points,
    vehicle,
    {
      id,
      startIndex: startHour,
      endIndexExclusive: startHour + windowHours,
      startSocPercent,
      targetSocPercent,
    },
    1,
  );
  results.push(result);
  const grouped = resultsByCountry.get(profile.country) ?? [];
  grouped.push(result);
  resultsByCountry.set(profile.country, grouped);
}

const summary = summarizeBacktest(results);
const annualGridEnergyKwh =
  ((annualDistanceKm * 0.155) / vehicle.chargingEfficiency) * homeChargingShare;
const countryResults: CountryResult[] = [...resultsByCountry]
  .map(([country, countryRuns]) => {
    const countrySummary = summarizeBacktest(countryRuns);
    const baselineCarbonIntensity =
      countrySummary.baselineEmissionsGco2 /
      sum(countryRuns.map((run) => run.baseline.gridEnergyKwh));
    const optimizedCarbonIntensity =
      countrySummary.optimizedEmissionsGco2 /
      sum(countryRuns.map((run) => run.optimized.gridEnergyKwh));
    return {
      country,
      runs: countryRuns.length,
      averageSavingsPercent: countrySummary.averageSavingsPercent,
      baselineCarbonIntensity,
      optimizedCarbonIntensity,
      annualBaselineKgco2: (baselineCarbonIntensity * annualGridEnergyKwh) / 1_000,
      annualOptimizedKgco2: (optimizedCarbonIntensity * annualGridEnergyKwh) / 1_000,
      annualSavedKgco2:
        ((baselineCarbonIntensity - optimizedCarbonIntensity) * annualGridEnergyKwh) / 1_000,
    };
  })
  .toSorted((a, b) => b.annualSavedKgco2 - a.annualSavedKgco2);

const baselineCarbonIntensity =
  summary.baselineEmissionsGco2 / sum(results.map((run) => run.baseline.gridEnergyKwh));
const optimizedCarbonIntensity =
  summary.optimizedEmissionsGco2 / sum(results.map((run) => run.optimized.gridEnergyKwh));
const report = {
  metadata: {
    generatedAt: new Date().toISOString(),
    title: 'Tesla Model Y Long Range: 500 global country-grid charging scenarios',
    dataSource:
      'Calibrated representative national-grid scenario profiles; not live measured forecasts.',
    countriesRepresented: profiles.length,
    seed,
    vehicle: { ...vehicle, model: 'Tesla Model Y Long Range', energyUseKwhPer100Km: 15.5 },
    chargingWindowHours: '6-14',
    startSocPercent: '15-60',
    targetSocPercent: 'start SOC + 25-60 points, capped at 90%',
    baseline: 'Charge immediately at 11 kW AC until the target is reached.',
    optimized: 'Charge in the lowest-carbon hours inside the same plug-in window.',
    annualAssumptions: {
      annualDistanceKm,
      homeChargingShare,
      controllableGridEnergyKwh: annualGridEnergyKwh,
    },
  },
  summary: {
    ...summary,
    baselineCarbonIntensity,
    optimizedCarbonIntensity,
    annualBaselineKgco2: (baselineCarbonIntensity * annualGridEnergyKwh) / 1_000,
    annualOptimizedKgco2: (optimizedCarbonIntensity * annualGridEnergyKwh) / 1_000,
    annualSavedKgco2:
      ((baselineCarbonIntensity - optimizedCarbonIntensity) * annualGridEnergyKwh) / 1_000,
  },
  countries: countryResults,
  scenarios: results.map((result) => ({
    country: profiles[(result.scenario.id - 1) % profiles.length].country,
    ...result,
  })),
};

const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Global cases: ${summary.runs} across ${profiles.length} country profiles`);
console.log(`Completed: ${summary.completedOptimized}/${summary.runs}`);
console.log(
  `Average session saving: ${format(summary.averageSavingsPercent)}% (median ${format(summary.medianSavingsPercent)}%)`,
);
console.log(`Weighted emission saving: ${format(summary.emissionsSavingsPercent)}%`);
console.log(
  `Average grid intensity: ${format(baselineCarbonIntensity, 0)} -> ${format(optimizedCarbonIntensity, 0)} gCO2/kWh`,
);
console.log(
  `Annual estimate (${format(annualDistanceKm, 0)} km, ${format(homeChargingShare * 100, 0)}% smart-chargeable): ${format(report.summary.annualSavedKgco2, 1)} kgCO2 saved`,
);
console.log(`Report: ${outputPath}`);

function buildWeek(profile: GridProfile, id: number, rng: () => number): CarbonIntensity[] {
  return Array.from({ length: 168 }, (_, index) => {
    const hour = index % 24;
    const day = Math.floor(index / 24);
    const eveningPeak = Math.max(0, Math.cos(((hour - 20) / 24) * 2 * Math.PI));
    const solarDip = Math.max(0, Math.cos(((hour - 12) / 24) * 2 * Math.PI));
    const renewableWave =
      Math.sin((index + id * 3) * 0.73) * 0.24 + Math.sin((day + id) * 1.7) * 0.16;
    const carbonIntensity = Math.max(
      5,
      profile.meanGco2PerKwh +
        profile.dailyVariationGco2PerKwh *
          (eveningPeak - solarDip * 1.25 + renewableWave + (rng() - 0.5) * 0.12),
    );
    return {
      zone: profile.country,
      carbonIntensity,
      datetime: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
    };
  });
}

function readArgument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function readPositiveInteger(name: string, fallback: number) {
  const value = readArgument(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
function readPositiveNumber(name: string, fallback: number) {
  const value = readArgument(name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive number.`);
  return parsed;
}
function readShare(name: string, fallback: number) {
  const parsed = readPositiveNumber(name, fallback);
  if (parsed > 1) throw new Error(`${name} must be at most 1.`);
  return parsed;
}
function mulberry32(seedValue: number) {
  let value = seedValue >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}
function randomInteger(rng: () => number, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}
function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
function format(value: number, digits = 2) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value);
}
