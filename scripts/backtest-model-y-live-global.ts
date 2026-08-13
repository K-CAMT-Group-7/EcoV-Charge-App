import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  runScenario,
  summarizeBacktest,
  type BacktestVehicle,
  type ScenarioResult,
} from '../src/packages/charging/backtest';
import type { CarbonIntensity } from '../src/packages/electricitymaps/api';

interface CountryLocation {
  country: string;
  latitude: number;
  longitude: number;
}

interface Forecast {
  country: string;
  zone: string;
  points: CarbonIntensity[];
}

const countries: CountryLocation[] = [
  ['Argentina', -34.6037, -58.3816],
  ['Australia', -33.8688, 151.2093],
  ['Austria', 48.2082, 16.3738],
  ['Belgium', 50.8503, 4.3517],
  ['Brazil', -23.5505, -46.6333],
  ['Canada', 43.6532, -79.3832],
  ['Chile', -33.4489, -70.6693],
  ['China', 31.2304, 121.4737],
  ['Colombia', 4.711, -74.0721],
  ['Denmark', 55.6761, 12.5683],
  ['Finland', 60.1699, 24.9384],
  ['France', 48.8566, 2.3522],
  ['Germany', 52.52, 13.405],
  ['Greece', 37.9838, 23.7275],
  ['India', 28.6139, 77.209],
  ['Indonesia', -6.2088, 106.8456],
  ['Italy', 41.9028, 12.4964],
  ['Japan', 35.6762, 139.6503],
  ['Mexico', 19.4326, -99.1332],
  ['Morocco', 33.5731, -7.5898],
  ['Netherlands', 52.3676, 4.9041],
  ['New Zealand', -36.8485, 174.7633],
  ['Norway', 59.9139, 10.7522],
  ['Peru', -12.0464, -77.0428],
  ['Poland', 52.2297, 21.0122],
  ['Portugal', 38.7223, -9.1393],
  ['Saudi Arabia', 24.7136, 46.6753],
  ['Singapore', 1.3521, 103.8198],
  ['South Africa', -26.2041, 28.0473],
  ['South Korea', 37.5665, 126.978],
  ['Spain', 40.4168, -3.7038],
  ['Sweden', 59.3293, 18.0686],
  ['Switzerland', 47.3769, 8.5417],
  ['Taiwan', 25.033, 121.5654],
  ['Thailand', 13.7563, 100.5018],
  ['Turkey', 41.0082, 28.9784],
  ['United Arab Emirates', 25.2048, 55.2708],
  ['United Kingdom', 51.5072, -0.1276],
  ['United States', 40.7128, -74.006],
  ['Vietnam', 21.0278, 105.8342],
].map(([country, latitude, longitude]) => ({
  country: String(country),
  latitude: Number(latitude),
  longitude: Number(longitude),
}));

const vehicle: BacktestVehicle = {
  batteryCapacityKwh: 79.7,
  maxChargePowerKw: 11,
  chargingEfficiency: 0.92,
};
const runs = readPositiveInteger('--runs', 500);
const seed = readPositiveInteger('--seed', 20260813);
const output = readArgument('--output') ?? 'reports/model-y-live-global-500-backtest.json';
const annualDistanceKm = readPositiveNumber('--annual-km', 15_000);
const homeChargingShare = readShare('--home-charging-share', 0.85);
const forecasts = await loadForecasts(countries);
if (!forecasts.length) throw new Error('No live forecasts were returned by Electricity Maps.');

const random = mulberry32(seed);
const results: Array<ScenarioResult & { country: string; zone: string }> = [];
for (let id = 1; id <= runs; id += 1) {
  const forecast = forecasts[(id - 1) % forecasts.length];
  const windowSlots = randomInteger(random, 72, 168); // 6-14 hours at five-minute resolution
  const startIndex = randomInteger(random, 0, forecast.points.length - windowSlots);
  const startSocPercent = randomInteger(random, 15, 60);
  const targetSocPercent = Math.min(90, startSocPercent + randomInteger(random, 25, 60));
  results.push({
    ...runScenario(
      forecast.points,
      vehicle,
      {
        id,
        startIndex,
        endIndexExclusive: startIndex + windowSlots,
        startSocPercent,
        targetSocPercent,
      },
      1 / 12,
    ),
    country: forecast.country,
    zone: forecast.zone,
  });
}

const summary = summarizeBacktest(results);
const annualGridEnergyKwh =
  ((annualDistanceKm * 0.155) / vehicle.chargingEfficiency) * homeChargingShare;
const baselineCarbonIntensity =
  summary.baselineEmissionsGco2 / sum(results.map((result) => result.baseline.gridEnergyKwh));
const optimizedCarbonIntensity =
  summary.optimizedEmissionsGco2 / sum(results.map((result) => result.optimized.gridEnergyKwh));
const countrySummary = Object.values(Object.groupBy(results, (result) => result.country))
  .map((countryRuns) => {
    const countryResults = countryRuns ?? [];
    const countryBacktest = summarizeBacktest(countryResults);
    const baselineIntensity =
      countryBacktest.baselineEmissionsGco2 /
      sum(countryResults.map((result) => result.baseline.gridEnergyKwh));
    const optimizedIntensity =
      countryBacktest.optimizedEmissionsGco2 /
      sum(countryResults.map((result) => result.optimized.gridEnergyKwh));
    return {
      country: countryResults[0].country,
      zone: countryResults[0].zone,
      runs: countryResults.length,
      averageSavingsPercent: countryBacktest.averageSavingsPercent,
      baselineCarbonIntensity: baselineIntensity,
      optimizedCarbonIntensity: optimizedIntensity,
      annualSavedKgco2: ((baselineIntensity - optimizedIntensity) * annualGridEnergyKwh) / 1_000,
    };
  })
  .toSorted((left, right) => right.annualSavedKgco2 - left.annualSavedKgco2);

const report = {
  metadata: {
    generatedAt: new Date().toISOString(),
    dataSource: 'Electricity Maps live carbon-intensity forecast API',
    countryRequests: countries.length,
    countriesRepresented: forecasts.length,
    seed,
    vehicle: { ...vehicle, model: 'Tesla Model Y Long Range', energyUseKwhPer100Km: 15.5 },
    chargingWindowHours: '6-14',
    annualAssumptions: {
      annualDistanceKm,
      homeChargingShare,
      controllableGridEnergyKwh: annualGridEnergyKwh,
    },
    baseline: 'Charge immediately at 11 kW AC until the target is reached.',
    optimized:
      'Charge in the lowest-carbon available five-minute slots inside the same plug-in window.',
    forecasts: forecasts.map(({ country, zone, points }) => ({
      country,
      zone,
      points: points.length,
      start: points[0].datetime,
      end: points.at(-1)?.datetime,
    })),
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
  countries: countrySummary,
  scenarios: results.map(({ baseline, optimized, ...result }) => ({
    ...result,
    baseline: omitCharges(baseline),
    optimized: omitCharges(optimized),
  })),
};

const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Live API forecasts: ${forecasts.length}/${countries.length} countries`);
console.log(
  `Global cases: ${summary.runs}; completion: ${summary.completedOptimized}/${summary.runs}`,
);
console.log(
  `Weighted emission saving: ${format(summary.emissionsSavingsPercent)}%; session average: ${format(summary.averageSavingsPercent)}%`,
);
console.log(
  `Average grid intensity: ${format(baselineCarbonIntensity, 0)} -> ${format(optimizedCarbonIntensity, 0)} gCO2/kWh`,
);
console.log(`Annual estimate: ${format(report.summary.annualSavedKgco2, 1)} kgCO2 saved`);
console.log(`Report: ${outputPath}`);

async function loadForecasts(locations: CountryLocation[]) {
  const apiUrl = (
    process.env.EXPO_PUBLIC_ELECTRICITYMAPS_API_URL ?? process.env.ELECTRICITYMAPS_API_URL
  )
    ?.replace(/\/+$/, '')
    .replace(/\/v4$/, '');
  const apiKey =
    process.env.EXPO_PUBLIC_ELECTRICITYMAPS_API_KEY ?? process.env.ELECTRICITYMAPS_API_KEY;
  if (!apiUrl || !apiKey)
    throw new Error('Set ELECTRICITYMAPS_API_URL and ELECTRICITYMAPS_API_KEY in .env.');
  const loadedForecasts: Forecast[] = [];
  for (const location of locations) {
    const params = new URLSearchParams({
      lat: String(location.latitude),
      lon: String(location.longitude),
      temporalGranularity: '5_minutes',
      horizonHours: '24',
    });
    const response = await fetch(`${apiUrl}/v4/carbon-intensity/forecast?${params}`, {
      headers: { 'auth-token': apiKey },
    });
    if (!response.ok)
      throw new Error(
        `${location.country}: Electricity Maps returned ${response.status} ${response.statusText}.`,
      );
    const payload = (await response.json()) as { zone: string; forecast: CarbonIntensity[] };
    const points = payload.forecast
      .filter(
        (point) =>
          Number.isFinite(point.carbonIntensity) &&
          point.carbonIntensity >= 0 &&
          Number.isFinite(Date.parse(point.datetime)),
      )
      .toSorted((left, right) => Date.parse(left.datetime) - Date.parse(right.datetime));
    if (points.length < 169)
      throw new Error(
        `${location.country}: expected at least 169 five-minute forecast points, received ${points.length}.`,
      );
    loadedForecasts.push({ country: location.country, zone: payload.zone, points });
  }
  return loadedForecasts;
}

function omitCharges({ charges: _charges, ...strategy }: ScenarioResult['baseline']) {
  return strategy;
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
function randomInteger(randomSource: () => number, min: number, max: number) {
  return Math.floor(randomSource() * (max - min + 1)) + min;
}
function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
function format(value: number, digits = 2) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value);
}
