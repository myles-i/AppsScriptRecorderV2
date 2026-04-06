import { describe, it, expect, vi } from 'vitest';
import { formatCoords, reverseGeocode } from '../../../src/utils/geo';

describe('formatCoords', () => {
  it('formats lat/lng as a human-readable string', () => {
    const result = formatCoords(37.7749, -122.4194);
    expect(result).toContain('37.7749');
    expect(result).toContain('122.4194');
  });

  it('includes N/S and E/W indicators', () => {
    const north = formatCoords(37, -122);
    expect(north).toMatch(/N/);
    expect(north).toMatch(/W/);
    const south = formatCoords(-33, 151);
    expect(south).toMatch(/S/);
    expect(south).toMatch(/E/);
  });

  it('uses compass direction instead of sign for longitude', () => {
    const west = formatCoords(37.7749, -122.4194);
    expect(west).toContain('W');
    expect(west).not.toContain('-');
    const east = formatCoords(51.5074, 0.1278);
    expect(east).toContain('E');
  });
});

describe('reverseGeocode', () => {
  it('returns a location label on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          address: { city: 'San Francisco', state: 'CA', country: 'US' },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const label = await reverseGeocode(37.7749, -122.4194);
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('network'));
    const label = await reverseGeocode(37.7749, -122.4194);
    expect(label).toBeNull();
  });

  it('returns null when fetch returns no useful data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } }),
    );
    const label = await reverseGeocode(37.7749, -122.4194);
    expect(label).toBeNull();
  });
});
