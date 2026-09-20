'use client';

import { LatLng } from './data';

export interface GeocodeHit {
  lat: number;
  lng: number;
  label: string;
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
