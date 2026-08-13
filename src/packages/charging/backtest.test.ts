import { describe, expect, test } from 'bun:test';

import type { CarbonIntensity } from '../electricitymaps/api';
import { inferSlotHours, runScenario, summarizeBacktest } from './backtest';

const vehicle = {
  batteryCapacityKwh: 60,
  maxChargePowerKw: 12,
  chargingEfficiency: 1,
};

const points: CarbonIntensity[] = [400, 100, 300, 200].map((carbonIntensity, index) => ({
  zone: 'TEST',
  carbonIntensity,
  datetime: new Date(Date.UTC(2026, 0, 1, index)).toISOString(),
}));

describe('charging backtest', () => {
  test('infers the slot duration from API timestamps', () => {
    expect(inferSlotHours(points)).toBe(1);
  });

  test('selects low-carbon slots and supports a partial final slot', () => {
    const result = runScenario(
      points,
      vehicle,
      {
        id: 1,
        startIndex: 0,
        endIndexExclusive: 4,
        startSocPercent: 20,
        targetSocPercent: 50,
      },
      1,
    );

    expect(result.requiredBatteryEnergyKwh).toBe(18);
    expect(result.baseline.emissionsGco2).toBe(5_400);
    expect(result.optimized.emissionsGco2).toBe(2_400);
    expect(result.optimized.charges.map((charge) => charge.carbonIntensity)).toEqual([100, 200]);
    expect(result.optimized.charges[1].gridEnergyKwh).toBe(6);
    expect(result.emissionsSavingsPercent).toBeCloseTo(55.555_556);
  });

  test('summarizes completion and total emissions', () => {
    const result = runScenario(
      points,
      vehicle,
      {
        id: 1,
        startIndex: 0,
        endIndexExclusive: 4,
        startSocPercent: 20,
        targetSocPercent: 50,
      },
      1,
    );
    const summary = summarizeBacktest([result]);

    expect(summary.completedBaseline).toBe(1);
    expect(summary.completedOptimized).toBe(1);
    expect(summary.emissionsSavedGco2).toBe(3_000);
  });
});
