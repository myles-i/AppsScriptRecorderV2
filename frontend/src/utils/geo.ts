import type { GeoLocation } from '../api/types';

/**
 * Format lat/lng as a human-readable coordinate string.
 * Example: "37.7749°N, 122.4194°W"
 */
export function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

/**
 * Reverse-geocode coordinates using the Nominatim API (OpenStreetMap).
 * Returns a human-readable label or null on failure.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`;
    const response = await fetch(url, {
      headers: { 'Accept-Language': 'en' },
    });
    const data = (await response.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        state?: string;
        country_code?: string;
        country?: string;
      };
    };

    if (!data.address) return null;

    const { address } = data;
    const city = address.city ?? address.town ?? address.village;
    const state = address.state;
    const country = address.country_code?.toUpperCase();

    const parts = [city, state, country].filter(Boolean);
    if (parts.length === 0) return null;

    return parts.join(', ');
  } catch {
    return null;
  }
}

/**
 * Request the user's current location. Returns null if denied or unavailable.
 */
export function getCurrentLocation(): Promise<GeoLocation | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: formatCoords(pos.coords.latitude, pos.coords.longitude),
        });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 5000 },
    );
  });
}

/**
 * Watch location while recording. Returns a cleanup function.
 */
export function watchLocation(
  onLocation: (location: GeoLocation) => void,
): () => void {
  if (!('geolocation' in navigator)) return () => undefined;

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onLocation({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        label: formatCoords(pos.coords.latitude, pos.coords.longitude),
      });
    },
    () => undefined,
    { enableHighAccuracy: false },
  );

  return () => navigator.geolocation.clearWatch(id);
}
