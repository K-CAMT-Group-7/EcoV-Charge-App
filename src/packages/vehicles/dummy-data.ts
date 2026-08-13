import { VehicleChargingStore, type VehicleChargingStoreSeed } from './vehicle-charging-store';

/** Seed data used only when no saved vehicle data exists yet. */
export const dummyVehicleChargingData: VehicleChargingStoreSeed = {
  vehicles: [
    {
      id: 'tesla-model-y-long-range',
      displayName: 'Tesla Model Y Long Range',
      manufacturer: 'Tesla',
      model: 'Model Y Long Range',
      modelYear: 2026,
      batteryCapacityKwh: 79.7,
      acChargingPowerKw: 11,
      dcFastChargingPowerKw: 250,
      chargingEfficiencyPercent: 92,
      connectorTypes: ['NACS', 'Type 2'],
    },
  ],
  chargingRecords: [
    {
      id: 'charge-2026-08-10-home',
      vehicleId: 'tesla-model-y-long-range',
      startedAt: '2026-08-10T22:15:00.000Z',
      endedAt: '2026-08-11T00:05:00.000Z',
      startBatteryPercent: 41,
      endBatteryPercent: 72,
      energyKwh: 25.1,
      carbonIntensityGco2PerKwh: 218,
    },
  ],
};

/** A ready-to-use store for screens that currently rely on dummy data. */
export const vehicleChargingStore = new VehicleChargingStore(dummyVehicleChargingData);
