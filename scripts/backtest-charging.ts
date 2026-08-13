import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  generateScenarios,
  inferSlotHours,
  runScenario,
  summarizeBacktest,
  type BacktestVehicle,
} from '../src/packages/charging/backtest';
import { getCarbonIntensityForecast } from '../src/packages/electricitymaps/api';

interface CliOptions {
  latitude: number;
  longitude: number;
  runs: number;
  seed: number;
  output: string;
}

const options = parseArguments(process.argv.slice(2));
const vehicle: BacktestVehicle = {
  // Same default specification as src/packages/vehicles/dummy-data.ts.
  batteryCapacityKwh: 79.7,
  maxChargePowerKw: 11,
  chargingEfficiency: 0.92,
};

const apiResult = await getCarbonIntensityForecast(
  { latitude: options.latitude, longitude: options.longitude },
  { temporalGranularity: '5_minutes', horizonHours: 24 },
);
const points = apiResult.forecast
  .filter(
    (point) =>
      Number.isFinite(point.carbonIntensity) &&
      point.carbonIntensity >= 0 &&
      Number.isFinite(Date.parse(point.datetime)),
  )
  .toSorted((left, right) => Date.parse(left.datetime) - Date.parse(right.datetime));

const slotHours = inferSlotHours(points);
const scenarios = generateScenarios(points.length, vehicle, slotHours, options.runs, options.seed);
const results = scenarios.map((scenario) => runScenario(points, vehicle, scenario, slotHours));
const summary = summarizeBacktest(results);
const report = {
  metadata: {
    generatedAt: new Date().toISOString(),
    dataSource: 'Electricity Maps carbon-intensity forecast API',
    zone: apiResult.zone,
    location: { latitude: options.latitude, longitude: options.longitude },
    sourcePointCount: points.length,
    sourceStart: points[0]?.datetime,
    sourceEnd: points.at(-1)?.datetime,
    slotMinutes: slotHours * 60,
    seed: options.seed,
    vehicle,
    baseline: 'Charge immediately at maximum power until the target is reached.',
    optimized: 'Charge in the lowest-carbon available slots until the target is reached.',
  },
  summary,
  scenarios: results,
};

const outputPath = resolve(options.output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Zone: ${apiResult.zone}`);
console.log(
  `API data: ${points.length} points, ${formatNumber(slotHours * 60, 0)}-minute intervals`,
);
console.log(`Scenarios: ${summary.runs}`);
console.log(`Target completion: ${summary.completedOptimized}/${summary.runs}`);
console.log(`Baseline emissions: ${formatNumber(summary.baselineEmissionsGco2 / 1_000)} kgCO2`);
console.log(`Optimized emissions: ${formatNumber(summary.optimizedEmissionsGco2 / 1_000)} kgCO2`);
console.log(`Emissions saved: ${formatNumber(summary.emissionsSavedGco2 / 1_000)} kgCO2`);
console.log(`Total savings: ${formatNumber(summary.emissionsSavingsPercent)}%`);
console.log(`Average session savings: ${formatNumber(summary.averageSavingsPercent)}%`);
console.log(`Median session savings: ${formatNumber(summary.medianSavingsPercent)}%`);
console.log(
  `Session savings range: ${formatNumber(summary.minSavingsPercent)}% - ${formatNumber(summary.maxSavingsPercent)}%`,
);
console.log(`Report: ${outputPath}`);

function parseArguments(args: string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        'Arguments must use --name value pairs. Supported: --lat, --lon, --runs, --seed, --output.',
      );
    }
    values.set(key, value);
  }

  return {
    // Seoul is only a CLI default; callers can provide any API-supported coordinates.
    latitude: parseNumber(values.get('--lat') ?? '37.5665', '--lat'),
    longitude: parseNumber(values.get('--lon') ?? '126.9780', '--lon'),
    runs: parseInteger(values.get('--runs') ?? '100', '--runs'),
    seed: parseInteger(values.get('--seed') ?? '20260812', '--seed'),
    output: values.get('--output') ?? 'reports/charging-backtest-latest.json',
  };
}

function parseNumber(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

function parseInteger(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(value);
}
