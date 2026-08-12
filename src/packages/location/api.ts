import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

const WEB_GEOCODER_URL =
  process.env.EXPO_PUBLIC_LOCATION_GEOCODER_URL ??
  'https://api.bigdatacloud.net/data/reverse-geocode-client';

export interface UserCountry {
  /** ISO 3166-1 alpha-2 country code, for example `KR`. */
  countryCode: string;
  /** Localized country name returned by the platform geocoder, when available. */
  country: string;
  latitude: number;
  longitude: number;
}

export interface UserLocation {
  latitude: number;
  longitude: number;
}

const LOCATION_CACHE_FILE = `${FileSystem.documentDirectory ?? ''}ecov-charge-location.json`;

function canUseWebStorage() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.localStorage;
}

/** Saves the last approved location locally so the landing screen can render immediately. */
export async function saveUserLocation(location: UserCountry): Promise<void> {
  const serialized = JSON.stringify(location);
  if (canUseWebStorage()) {
    window.localStorage.setItem('ecov-charge-location', serialized);
    return;
  }
  if (!FileSystem.documentDirectory) return;
  await FileSystem.writeAsStringAsync(LOCATION_CACHE_FILE, serialized);
}

/** Reads the locally cached location. This never asks for permission. */
export async function loadSavedUserLocation(): Promise<UserCountry | null> {
  try {
    const serialized = canUseWebStorage()
      ? window.localStorage.getItem('ecov-charge-location')
      : FileSystem.documentDirectory
        ? await FileSystem.readAsStringAsync(LOCATION_CACHE_FILE)
        : null;
    if (!serialized) return null;
    const value = JSON.parse(serialized) as Partial<UserCountry>;
    if (
      typeof value.countryCode !== 'string' ||
      typeof value.country !== 'string' ||
      typeof value.latitude !== 'number' ||
      typeof value.longitude !== 'number'
    ) {
      return null;
    }
    return value as UserCountry;
  } catch {
    return null;
  }
}

export type UserCountryErrorCode =
  | 'PERMISSION_DENIED'
  | 'LOCATION_UNAVAILABLE'
  | 'COUNTRY_UNAVAILABLE'
  | 'TIMEOUT';

export class UserCountryError extends Error {
  readonly code: UserCountryErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: UserCountryErrorCode, cause?: unknown) {
    super(message);
    this.name = 'UserCountryError';
    this.code = code;
    this.cause = cause;
  }
}

export interface GetCurrentCountryOptions {
  /** Reuse a cached device position when available. Defaults to true. */
  useLastKnownPosition?: boolean;
  /** Maximum time to wait for a fresh position. Defaults to 10 seconds. */
  timeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new UserCountryError('Unable to determine your location in time.', 'TIMEOUT')),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function normalizeCountryCode(value: string | null | undefined): string | undefined {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{2}$/.test(code) ? code : undefined;
}

async function getPosition(options: GetCurrentCountryOptions) {
  let lastKnown = null;
  if (options.useLastKnownPosition !== false) {
    try {
      lastKnown = await Location.getLastKnownPositionAsync();
    } catch {
      // A last-known position is an optimization. Continue with a fresh fix.
    }
  }

  if (lastKnown) return lastKnown;

  try {
    return await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      options.timeoutMs ?? 10_000,
    );
  } catch (error) {
    if (error instanceof UserCountryError) throw error;
    throw new UserCountryError(
      'Unable to determine your current location.',
      'LOCATION_UNAVAILABLE',
      error,
    );
  }
}

interface WebGeocoderResponse {
  countryName?: string;
  countryCode?: string;
}

async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<{ country: string | null; isoCountryCode: string | null }> {
  if (Platform.OS !== 'web') {
    const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
    return {
      country: address?.country ?? null,
      isoCountryCode: address?.isoCountryCode ?? null,
    };
  }

  const url = new URL(WEB_GEOCODER_URL);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('localityLanguage', 'en');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Web geocoder returned ${response.status}.`);

  const result = (await response.json()) as WebGeocoderResponse;
  return {
    country: result.countryName ?? null,
    isoCountryCode: result.countryCode ?? null,
  };
}

/**
 * Requests foreground location permission and returns the user's country.
 * Works through Expo Location on iOS, Android, and browsers that support
 * the Geolocation API. The browser must be served from HTTPS or localhost.
 * Web reverse geocoding uses `EXPO_PUBLIC_LOCATION_GEOCODER_URL` when set;
 * otherwise the default BigDataCloud endpoint is used.
 */
export async function getCurrentCountry(
  options: GetCurrentCountryOptions = {},
): Promise<UserCountry> {
  const position = await getCurrentLocation(options);

  try {
    const address = await reverseGeocode(position.latitude, position.longitude);
    const countryCode = normalizeCountryCode(address.isoCountryCode);

    if (!countryCode || !address.country) {
      throw new UserCountryError(
        'Your location was found, but the country could not be resolved.',
        'COUNTRY_UNAVAILABLE',
      );
    }

    return {
      countryCode,
      country: address.country,
      latitude: position.latitude,
      longitude: position.longitude,
    };
  } catch (error) {
    if (error instanceof UserCountryError) throw error;
    throw new UserCountryError(
      'Your location was found, but the country could not be resolved.',
      'COUNTRY_UNAVAILABLE',
      error,
    );
  }
}

/** Requests foreground permission and returns the current coordinates. */
export async function getCurrentLocation(
  options: GetCurrentCountryOptions = {},
): Promise<UserLocation> {
  const permission = await Location.getForegroundPermissionsAsync();
  const granted = permission.granted
    ? permission
    : await Location.requestForegroundPermissionsAsync();

  if (!granted.granted) {
    throw new UserCountryError(
      'Location permission is required to detect your country.',
      'PERMISSION_DENIED',
    );
  }

  let position;
  try {
    position = await getPosition(options);
  } catch (error) {
    if (error instanceof UserCountryError) throw error;
    throw new UserCountryError(
      'Unable to determine your current location.',
      'LOCATION_UNAVAILABLE',
      error,
    );
  }

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
