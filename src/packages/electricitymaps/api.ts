const API_URL = process.env.EXPO_PUBLIC_ELECTRICITYMAPS_API_URL?.replace(/\/+$/, '').replace(
  /\/v4$/,
  '',
);
const API_KEY = process.env.EXPO_PUBLIC_ELECTRICITYMAPS_API_KEY;
const SERVER_API_URL = process.env.EXPO_PUBLIC_SERVER_API_URL?.replace(/\/+$/, '');

export interface GeolocationQuery {
  latitude: number;
  longitude: number;
}

export function isElectricityMapsConfigured() {
  return Boolean(SERVER_API_URL || (API_URL && API_KEY));
}

export type ApiRequestOptions = RequestInit;

export interface CarbonIntensity {
  zone: string;
  carbonIntensity: number;
  datetime: string;
  updatedAt?: string;
  estimationMethod?: string;
  isEstimated?: boolean;
  temporalGranularity?: string;
}

export interface CarbonIntensityForecast {
  zone: string;
  forecast: CarbonIntensity[];
}

export interface CarbonIntensityForecastOptions {
  /** API time resolution. The app keeps its existing 15-minute default. */
  temporalGranularity?: '5_minutes' | '15_minutes' | 'hourly';
  /** Number of future hours requested from Electricity Maps. */
  horizonHours?: number;
  request?: ApiRequestOptions;
}

interface ServerCarbonIntensityForecast {
  zone: string;
  points: Array<Omit<CarbonIntensity, 'zone'>>;
}

export class ElectricityMapsApiError extends Error {
  readonly status?: number;
  readonly statusText?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status?: number; statusText?: string; details?: unknown } = {},
  ) {
    super(message);
    this.name = 'ElectricityMapsApiError';
    this.status = options.status;
    this.statusText = options.statusText;
    this.details = options.details;
  }
}

function getApiConfig() {
  if (!API_URL || !API_KEY) {
    throw new ElectricityMapsApiError(
      'Electricity Maps API is not configured. Set EXPO_PUBLIC_ELECTRICITYMAPS_API_URL and EXPO_PUBLIC_ELECTRICITYMAPS_API_KEY.',
    );
  }

  return { apiUrl: API_URL, apiKey: API_KEY };
}

function getEndpointUrl(endpoint: string, apiUrl: string) {
  if (!endpoint.trim()) {
    throw new ElectricityMapsApiError('API endpoint cannot be empty.');
  }

  return `${apiUrl}/${endpoint.replace(/^\/+/, '')}`;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const body = await response.text();

  if (!body) {
    return undefined;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

export async function apiRequest<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const { apiUrl, apiKey } = getApiConfig();
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('auth-token', apiKey);

  let response: Response;
  try {
    response = await fetch(getEndpointUrl(endpoint, apiUrl), {
      ...options,
      headers,
    });
  } catch (error) {
    throw new ElectricityMapsApiError('Unable to reach the Electricity Maps API.', {
      details: error,
    });
  }

  const body = await readResponseBody(response);

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Electricity Maps API request failed with ${response.status} ${response.statusText}.`;

    throw new ElectricityMapsApiError(message, {
      status: response.status,
      statusText: response.statusText,
      details: body,
    });
  }

  return body as T;
}

export function getCarbonIntensity(zone: string, options?: ApiRequestOptions) {
  return apiRequest<CarbonIntensity>(
    `/v4/carbon-intensity/latest?zone=${encodeURIComponent(zone)}`,
    options,
  );
}

/**
 * Electricity Maps accepts either a zone or a lat/lon pair. We use the
 * coordinates collected from the device so regional zones (for example
 * US-CA or AU-NSW) are resolved accurately instead of guessing from country.
 */
export function getCarbonIntensityForecast(
  location: GeolocationQuery,
  options: CarbonIntensityForecastOptions = {},
) {
  const params = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    temporalGranularity: options.temporalGranularity ?? '15_minutes',
    horizonHours: String(options.horizonHours ?? 24),
  });
  if (!SERVER_API_URL) {
    return apiRequest<CarbonIntensityForecast>(
      `/v4/carbon-intensity/forecast?${params.toString()}`,
      options.request,
    );
  }

  const serverParams = new URLSearchParams({
    lat: String(location.latitude),
    lon: String(location.longitude),
    horizonHours: String(options.horizonHours ?? 24),
  });
  return fetch(`${SERVER_API_URL}/v1/carbon/forecast?${serverParams.toString()}`, options.request)
    .then(async (response) => {
      const body = await readResponseBody(response);
      if (!response.ok) {
        throw new ElectricityMapsApiError(
          `EcoV Charge server request failed with ${response.status} ${response.statusText}.`,
          { status: response.status, statusText: response.statusText, details: body },
        );
      }
      return body as ServerCarbonIntensityForecast;
    })
    .then((result) => ({
      zone: result.zone,
      forecast: result.points.map((point) => ({ ...point, zone: result.zone })),
    }));
}
