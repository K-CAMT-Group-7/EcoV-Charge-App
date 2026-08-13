import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const WEB_STORAGE_KEY = 'ecov-charge-vehicles';

/** Static information that identifies an electric vehicle. */
export interface VehicleMetadata {
  id: string;
  displayName: string;
  manufacturer: string;
  model: string;
  modelYear: number;
  batteryCapacityKwh: number;
  /** Maximum AC charging power in kW. */
  acChargingPowerKw: number;
  /** Maximum DC fast-charging power in kW. */
  dcFastChargingPowerKw: number;
  /** Battery charging efficiency after accounting for charging losses. */
  chargingEfficiencyPercent: number;
  connectorTypes: string[];
}

/** Measurements captured during one charging session. */
export interface ChargingRecord {
  id: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string;
  startBatteryPercent: number;
  endBatteryPercent: number;
  energyKwh: number;
  carbonIntensityGco2PerKwh?: number;
}

export interface ChargingRecordQuery {
  vehicleId?: string;
  startedFrom?: string;
  startedTo?: string;
}

export interface VehicleChargingStoreSeed {
  vehicles?: VehicleMetadata[];
  chargingRecords?: ChargingRecord[];
}

/**
 * Small local repository for prototypes and dummy data.
 *
 * Dates are stored as ISO 8601 strings so records can later be moved to an API
 * or local database without changing their serialized shape. Returned values
 * are copies, preventing callers from mutating the store accidentally. Data is
 * persisted in the app's document directory so it survives app restarts.
 */
export class VehicleChargingStore {
  private readonly vehicles = new Map<string, VehicleMetadata>();
  private readonly chargingRecords = new Map<string, ChargingRecord>();
  private readonly seed: VehicleChargingStoreSeed;
  private readonly storageFile: File | undefined;

  /** Resolves when the persisted data has been loaded. */
  readonly ready: Promise<void>;

  constructor(seed: VehicleChargingStoreSeed = {}) {
    this.seed = cloneSeed(seed);
    this.replaceData(seed);
    this.storageFile =
      Platform.OS === 'web' ? undefined : new File(Paths.document, 'ecov-charge-vehicles.json');
    this.ready = this.restore();
  }

  /** Creates a vehicle or replaces the vehicle with the same id. */
  saveVehicle(vehicle: VehicleMetadata): VehicleMetadata {
    validateVehicle(vehicle);
    const stored = cloneVehicle(vehicle);
    this.vehicles.set(stored.id, stored);
    this.persist();
    return cloneVehicle(stored);
  }

  getVehicle(id: string): VehicleMetadata | undefined {
    const vehicle = this.vehicles.get(id);
    return vehicle ? cloneVehicle(vehicle) : undefined;
  }

  listVehicles(): VehicleMetadata[] {
    return [...this.vehicles.values()]
      .map(cloneVehicle)
      .toSorted((left, right) => left.displayName.localeCompare(right.displayName));
  }

  /** Deletes a vehicle and its associated charging records. */
  deleteVehicle(id: string): boolean {
    if (!this.vehicles.delete(id)) return false;

    for (const [recordId, record] of this.chargingRecords) {
      if (record.vehicleId === id) this.chargingRecords.delete(recordId);
    }
    this.persist();
    return true;
  }

  /** Creates a charging record or replaces the record with the same id. */
  saveChargingRecord(record: ChargingRecord): ChargingRecord {
    if (!this.vehicles.has(record.vehicleId)) {
      throw new Error(`Cannot save charging record for unknown vehicle: ${record.vehicleId}`);
    }
    validateChargingRecord(record);
    const stored = { ...record };
    this.chargingRecords.set(stored.id, stored);
    this.persist();
    return { ...stored };
  }

  getChargingRecord(id: string): ChargingRecord | undefined {
    const record = this.chargingRecords.get(id);
    return record ? { ...record } : undefined;
  }

  /** Returns newest sessions first. All query bounds are inclusive. */
  listChargingRecords(query: ChargingRecordQuery = {}): ChargingRecord[] {
    const startedFrom = query.startedFrom ? parseDate(query.startedFrom, 'startedFrom') : undefined;
    const startedTo = query.startedTo ? parseDate(query.startedTo, 'startedTo') : undefined;

    if (startedFrom !== undefined && startedTo !== undefined && startedFrom > startedTo) {
      throw new Error('startedFrom must not be later than startedTo.');
    }

    return [...this.chargingRecords.values()]
      .filter((record) => {
        if (query.vehicleId && record.vehicleId !== query.vehicleId) return false;
        const startedAt = Date.parse(record.startedAt);
        if (startedFrom !== undefined && startedAt < startedFrom) return false;
        if (startedTo !== undefined && startedAt > startedTo) return false;
        return true;
      })
      .toSorted((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
      .map((record) => ({ ...record }));
  }

  getLatestChargingRecord(vehicleId: string): ChargingRecord | undefined {
    return this.listChargingRecords({ vehicleId })[0];
  }

  deleteChargingRecord(id: string): boolean {
    const deleted = this.chargingRecords.delete(id);
    if (deleted) this.persist();
    return deleted;
  }

  private replaceData(seed: VehicleChargingStoreSeed) {
    this.vehicles.clear();
    this.chargingRecords.clear();

    for (const vehicle of seed.vehicles ?? []) {
      validateVehicle(vehicle);
      this.vehicles.set(vehicle.id, cloneVehicle(vehicle));
    }
    for (const record of seed.chargingRecords ?? []) {
      if (!this.vehicles.has(record.vehicleId)) {
        throw new Error(`Cannot save charging record for unknown vehicle: ${record.vehicleId}`);
      }
      validateChargingRecord(record);
      this.chargingRecords.set(record.id, { ...record });
    }
  }

  private async restore() {
    try {
      if (Platform.OS === 'web') {
        const serialized = globalThis.localStorage?.getItem(WEB_STORAGE_KEY);
        const data = serialized ? (JSON.parse(serialized) as VehicleChargingStoreSeed) : undefined;
        if (data && hasStoredData(data)) this.replaceData(data);
        else {
          this.replaceData(this.seed);
          this.persist();
        }
        return;
      }

      if (!this.storageFile) return;
      if (this.storageFile.exists) {
        const data = JSON.parse(await this.storageFile.text()) as VehicleChargingStoreSeed;
        if (hasStoredData(data)) this.replaceData(data);
        else {
          this.replaceData(this.seed);
          this.persist();
        }
        return;
      }
    } catch {
      // A missing or invalid local file falls back to the bundled seed data.
    }

    this.replaceData(this.seed);
    this.persist();
  }

  private persist() {
    try {
      const data = JSON.stringify({
        vehicles: [...this.vehicles.values()],
        chargingRecords: [...this.chargingRecords.values()],
      });

      if (Platform.OS === 'web') {
        globalThis.localStorage?.setItem(WEB_STORAGE_KEY, data);
        return;
      }

      if (!this.storageFile) return;
      if (!this.storageFile.exists) this.storageFile.create({ intermediates: true });
      this.storageFile.write(data);
    } catch {
      // Keep the in-memory store usable when filesystem access is unavailable.
    }
  }
}

function cloneVehicle(vehicle: VehicleMetadata): VehicleMetadata {
  return { ...vehicle, connectorTypes: [...vehicle.connectorTypes] };
}

function cloneSeed(seed: VehicleChargingStoreSeed): VehicleChargingStoreSeed {
  return {
    vehicles: (seed.vehicles ?? []).map(cloneVehicle),
    chargingRecords: (seed.chargingRecords ?? []).map((record) => ({ ...record })),
  };
}

function hasStoredData(seed: VehicleChargingStoreSeed): boolean {
  return Boolean(seed.vehicles?.length || seed.chargingRecords?.length);
}

function validateVehicle(vehicle: VehicleMetadata) {
  requireText(vehicle.id, 'Vehicle id');
  requireText(vehicle.displayName, 'Vehicle displayName');
  requireText(vehicle.manufacturer, 'Vehicle manufacturer');
  requireText(vehicle.model, 'Vehicle model');
  if (!Number.isInteger(vehicle.modelYear) || vehicle.modelYear < 1886) {
    throw new Error('Vehicle modelYear must be a valid year.');
  }
  requirePositiveNumber(vehicle.batteryCapacityKwh, 'Vehicle batteryCapacityKwh');
  requirePositiveNumber(vehicle.acChargingPowerKw, 'Vehicle acChargingPowerKw');
  requirePositiveNumber(vehicle.dcFastChargingPowerKw, 'Vehicle dcFastChargingPowerKw');
  requirePercentage(vehicle.chargingEfficiencyPercent, 'Vehicle chargingEfficiencyPercent');
  if (!vehicle.connectorTypes.length || vehicle.connectorTypes.some((type) => !type.trim())) {
    throw new Error('Vehicle connectorTypes must contain at least one non-empty value.');
  }
}

function validateChargingRecord(record: ChargingRecord) {
  requireText(record.id, 'Charging record id');
  const startedAt = parseDate(record.startedAt, 'Charging record startedAt');
  const endedAt = parseDate(record.endedAt, 'Charging record endedAt');
  if (endedAt < startedAt) throw new Error('Charging record endedAt must follow startedAt.');
  requirePercentage(record.startBatteryPercent, 'Charging record startBatteryPercent');
  requirePercentage(record.endBatteryPercent, 'Charging record endBatteryPercent');
  if (record.endBatteryPercent < record.startBatteryPercent) {
    throw new Error('Charging record endBatteryPercent must not be below startBatteryPercent.');
  }
  requirePositiveNumber(record.energyKwh, 'Charging record energyKwh');
  if (
    record.carbonIntensityGco2PerKwh !== undefined &&
    (!Number.isFinite(record.carbonIntensityGco2PerKwh) || record.carbonIntensityGco2PerKwh < 0)
  ) {
    throw new Error('Charging record carbonIntensityGco2PerKwh must be zero or greater.');
  }
}

function requireText(value: string, field: string) {
  if (!value.trim()) throw new Error(`${field} cannot be empty.`);
}

function requirePositiveNumber(value: number, field: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be greater than zero.`);
}

function requirePercentage(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${field} must be between 0 and 100.`);
  }
}

function parseDate(value: string, field: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid ISO 8601 date.`);
  return timestamp;
}
