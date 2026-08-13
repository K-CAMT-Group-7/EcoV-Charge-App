import type { CreateServerVehicle } from '@/packages/server/api';

export interface VehicleCatalogItem extends CreateServerVehicle {
  catalogId: 'tesla-model-3' | 'tesla-model-y' | 'tesla-cybertruck';
  description: string;
}

/**
 * Representative 2026 Tesla configurations for charging-plan calculations.
 * Battery capacity and charging performance vary by trim, region, temperature,
 * and state of charge, so users can edit these values when model variants are added.
 */
export const teslaVehicleCatalog: readonly VehicleCatalogItem[] = [
  {
    catalogId: 'tesla-model-3',
    displayName: 'Tesla Model 3',
    manufacturer: 'Tesla',
    model: 'Model 3',
    modelYear: 2026,
    batteryCapacityKwh: 60,
    acChargingPowerKw: 11,
    dcFastChargingPowerKw: 175,
    chargingEfficiency: 0.92,
    connectorTypes: ['NACS'],
    description: 'Electric sport sedan',
  },
  {
    catalogId: 'tesla-model-y',
    displayName: 'Tesla Model Y',
    manufacturer: 'Tesla',
    model: 'Model Y',
    modelYear: 2026,
    batteryCapacityKwh: 79.7,
    acChargingPowerKw: 11,
    dcFastChargingPowerKw: 250,
    chargingEfficiency: 0.92,
    connectorTypes: ['NACS'],
    description: 'Midsize electric SUV',
  },
  {
    catalogId: 'tesla-cybertruck',
    displayName: 'Tesla Cybertruck',
    manufacturer: 'Tesla',
    model: 'Cybertruck',
    modelYear: 2026,
    batteryCapacityKwh: 123,
    acChargingPowerKw: 11.5,
    dcFastChargingPowerKw: 250,
    chargingEfficiency: 0.92,
    connectorTypes: ['NACS'],
    description: 'Electric pickup',
  },
] as const;

export function toCreateVehicle(item: VehicleCatalogItem): CreateServerVehicle {
  return {
    displayName: item.displayName,
    manufacturer: item.manufacturer,
    model: item.model,
    modelYear: item.modelYear,
    batteryCapacityKwh: item.batteryCapacityKwh,
    acChargingPowerKw: item.acChargingPowerKw,
    dcFastChargingPowerKw: item.dcFastChargingPowerKw,
    chargingEfficiency: item.chargingEfficiency,
    connectorTypes: [...item.connectorTypes],
  };
}
