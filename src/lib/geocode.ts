'use client';

import { LatLng } from './data';

/** How exact a match is: the address as given, its road, or its district. */
export type GeocodePrecision = 'exact' | 'road' | 'area';

export interface GeocodeHit {
  lat: number;
  lng: number;
  label: string;
  /** Older responses carry no precision; treat those as exact, as before. */
  precision?: GeocodePrecision;
  /** The query that actually matched, which may be wider than what was asked. */
  matched?: string;
}

const cache = new Map<string, GeocodeHit | null>();

/** Resolve a typed address to coordinates. Returns null when nothing matches. */
export async function geocode(query: string): Promise<GeocodeHit | null> {
  const q = query.trim();
  if (q.length < 4) return null;
  if (cache.has(q)) return cache.get(q) ?? null;
  try {
    const res = await fetch('/api/geocode?q=' + encodeURIComponent(q));
    if (!res.ok) return null;
    const body = (await res.json()) as { result: GeocodeHit | null };
    cache.set(q, body.result);
    return body.result;
  } catch {
    return null;
  }
}

export function hitToLatLng(hit: GeocodeHit): LatLng {
  return [hit.lat, hit.lng];
}

/** True when the pin landed on a road or a district rather than on the door. */
export function isApprox(hit: GeocodeHit): boolean {
  return hit.precision === 'road' || hit.precision === 'area';
}

export function precisionNote(hit: GeocodeHit): string {
  if (hit.precision === 'area') return 'only the district matched — check before you go';
  if (hit.precision === 'road') return 'matched the road, not the number';
  return '';
}

/**
 * Resolve a list of addresses one at a time.
 *
 * Nominatim asks for no more than one request a second and the app is a guest
 * there, so the queue is deliberately slow rather than parallel — importing a
 * long list is a thing you start and watch, not a thing that has to be instant.
 * `onEach` is called as every answer lands so the caller can show progress.
 */
export async function geocodeQueue<T>(
  items: T[],
  addressOf: (item: T) => string,
  onEach: (item: T, hit: GeocodeHit | null) => void,
  opts: { gapMs?: number; signal?: { cancelled: boolean } } = {},
): Promise<void> {
  const gap = opts.gapMs ?? 1100;
  for (let i = 0; i < items.length; i += 1) {
    if (opts.signal?.cancelled) return;
    const item = items[i];
    const addr = addressOf(item).trim();
    // Checked before the call, because the call is what fills the cache.
    const fresh = addr.length >= 4 && !cache.has(addr);
    const hit = addr ? await geocode(addr) : null;
    if (opts.signal?.cancelled) return;
    onEach(item, hit);
    // A cached answer cost nothing upstream, so it need not be paid for in time.
    if (fresh && i < items.length - 1) {
      await new Promise((r) => setTimeout(r, gap));
    }
  }
}
