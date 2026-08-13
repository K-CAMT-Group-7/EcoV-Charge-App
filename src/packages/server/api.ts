const SERVER_API_URL = process.env.EXPO_PUBLIC_SERVER_API_URL?.replace(/\/+$/, '');

export interface ServerUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerSession {
  token: string;
  expiresAt: string;
  user: ServerUser;
}

export interface ServerVehicle {
  id: string;
  userId: string;
  displayName: string;
  manufacturer: string;
  model: string;
  modelYear: number;
  batteryCapacityKwh: number;
  acChargingPowerKw: number;
  dcFastChargingPowerKw: number;
  chargingEfficiency: number;
  currentBatteryPercent: number;
  chargingStatus: 'connected' | 'charging' | 'completed';
  connectorTypes: string[];
  createdAt: string;
  updatedAt: string;
}

export type CreateServerVehicle = Omit<
  ServerVehicle,
  'id' | 'userId' | 'currentBatteryPercent' | 'chargingStatus' | 'createdAt' | 'updatedAt'
>;

export interface ServerChargingRecord {
  id: string;
  userId: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string;
  startBatteryPercent: number;
  endBatteryPercent: number;
  batteryEnergyKwh: number;
  gridEnergyKwh: number | null;
  averageCarbonIntensity: number | null;
  emissionsGco2: number | null;
  baselineEmissionsGco2: number;
  carbonSavingsGco2: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChargingImpactSummary {
  chargingCount: number;
  carbonSavingsGco2: number;
}

export interface ServerChargingSession {
  id: string;
  userId: string;
  vehicleId: string;
  status: 'scheduled' | 'charging' | 'completed' | 'stopped' | 'failed';
  controlMode: 'smart' | 'force';
  startedAt: string;
  targetAt: string;
  initialBatteryPercent: number;
  currentBatteryPercent: number;
  targetBatteryPercent: number;
  latitude: number;
  longitude: number;
  accumulatedBatteryEnergyKwh: number;
  accumulatedGridEnergyKwh: number;
  accumulatedEmissionsGco2: number;
  accumulatedBaselineBatteryEnergyKwh: number;
  accumulatedBaselineGridEnergyKwh: number;
  accumulatedBaselineEmissionsGco2: number;
  realizedCarbonSavingsGco2: number;
  estimatedOptimizedEmissionsGco2: number;
  estimatedImmediateEmissionsGco2: number;
  estimatedCarbonSavingsGco2: number;
  lastControlledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChargingSession {
  vehicleId: string;
  targetBatteryPercent: number;
  targetAt: string;
  latitude: number;
  longitude: number;
}

export interface ChargingEstimate {
  optimizedEmissionsGco2: number;
  immediateEmissionsGco2: number;
  carbonSavingsGco2: number;
}

export type CreateServerChargingRecord = Omit<
  ServerChargingRecord,
  | 'id'
  | 'userId'
  | 'gridEnergyKwh'
  | 'averageCarbonIntensity'
  | 'emissionsGco2'
  | 'baselineEmissionsGco2'
  | 'carbonSavingsGco2'
  | 'createdAt'
  | 'updatedAt'
> & {
  gridEnergyKwh?: number;
  averageCarbonIntensity?: number;
  emissionsGco2?: number;
  baselineEmissionsGco2?: number;
  carbonSavingsGco2?: number;
};

export class ServerApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ServerApiError';
    this.status = status;
  }
}

export function loginWithGoogle(idToken: string, deviceName = '') {
  return serverRequest<ServerSession>('/v1/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken, deviceName }),
  });
}

export function getMe(sessionToken: string) {
  return authenticatedRequest<ServerUser>('/v1/me', sessionToken);
}

export function logout(sessionToken: string) {
  return authenticatedRequest<void>('/v1/auth/logout', sessionToken, { method: 'POST' });
}

export async function listVehicles(sessionToken: string) {
  const result = await authenticatedRequest<{ vehicles: ServerVehicle[] }>(
    '/v1/vehicles',
    sessionToken,
  );
  return result.vehicles;
}

export function createVehicle(sessionToken: string, vehicle: CreateServerVehicle) {
  return authenticatedRequest<ServerVehicle>('/v1/vehicles', sessionToken, {
    method: 'POST',
    body: JSON.stringify(vehicle),
  });
}

export function updateVehicle(
  sessionToken: string,
  vehicleId: string,
  vehicle: CreateServerVehicle,
) {
  return authenticatedRequest<ServerVehicle>(
    `/v1/vehicles/${encodeURIComponent(vehicleId)}`,
    sessionToken,
    { method: 'PUT', body: JSON.stringify(vehicle) },
  );
}

export function deleteVehicle(sessionToken: string, vehicleId: string) {
  return authenticatedRequest<void>(`/v1/vehicles/${encodeURIComponent(vehicleId)}`, sessionToken, {
    method: 'DELETE',
  });
}

export async function listChargingRecords(
  sessionToken: string,
  options: { vehicleId?: string; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (options.vehicleId) params.set('vehicleId', options.vehicleId);
  if (options.limit) params.set('limit', String(options.limit));
  const serializedParams = params.toString();
  const query = serializedParams ? `?${serializedParams}` : '';
  const result = await authenticatedRequest<{ chargingRecords: ServerChargingRecord[] }>(
    `/v1/charging-records${query}`,
    sessionToken,
  );
  return result.chargingRecords;
}

export function getChargingImpactSummary(sessionToken: string, vehicleId: string) {
  return authenticatedRequest<ChargingImpactSummary>(
    `/v1/charging-records/impact-summary?vehicleId=${encodeURIComponent(vehicleId)}`,
    sessionToken,
  );
}

export function createChargingRecord(sessionToken: string, record: CreateServerChargingRecord) {
  return authenticatedRequest<ServerChargingRecord>('/v1/charging-records', sessionToken, {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

export function createChargingSession(sessionToken: string, session: CreateChargingSession) {
  return authenticatedRequest<ServerChargingSession>('/v1/charging-sessions', sessionToken, {
    method: 'POST',
    body: JSON.stringify(session),
  });
}

export function estimateChargingSession(sessionToken: string, session: CreateChargingSession) {
  return authenticatedRequest<ChargingEstimate>('/v1/charging-sessions/estimate', sessionToken, {
    method: 'POST',
    body: JSON.stringify(session),
  });
}

export async function getActiveChargingSession(sessionToken: string, vehicleId: string) {
  const result = await authenticatedRequest<{ chargingSession: ServerChargingSession | null }>(
    `/v1/charging-sessions/active?vehicleId=${encodeURIComponent(vehicleId)}`,
    sessionToken,
  );
  return result.chargingSession;
}

export function stopChargingSession(sessionToken: string, sessionId: string) {
  return authenticatedRequest<ServerChargingSession>(
    `/v1/charging-sessions/${encodeURIComponent(sessionId)}/stop`,
    sessionToken,
    { method: 'POST' },
  );
}

export function forceTopUpChargingSession(sessionToken: string, sessionId: string) {
  return authenticatedRequest<ServerChargingSession>(
    `/v1/charging-sessions/${encodeURIComponent(sessionId)}/force-top-up`,
    sessionToken,
    { method: 'POST' },
  );
}

export function disableForceTopUpChargingSession(sessionToken: string, sessionId: string) {
  return authenticatedRequest<ServerChargingSession>(
    `/v1/charging-sessions/${encodeURIComponent(sessionId)}/disable-force-top-up`,
    sessionToken,
    { method: 'POST' },
  );
}

function authenticatedRequest<T>(path: string, token: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return serverRequest<T>(path, { ...options, headers });
}

async function serverRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!SERVER_API_URL) {
    throw new ServerApiError('EXPO_PUBLIC_SERVER_API_URL is not configured.', 0);
  }
  const headers = new Headers(options.headers);
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${SERVER_API_URL}${path}`, { ...options, headers });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Server request failed with ${response.status}.`;
    throw new ServerApiError(message, response.status);
  }
  return body as T;
}
