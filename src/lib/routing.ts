'use client';

import { LatLng, TravelMode } from './data';

/** One piece of a transit journey — a ride, or the walk either side of it. */
export interface RoutePart {
  kind: 'walk' | 'ride';
  meters: number;
  seconds: number;
  label?: string;
}

export interface RouteLeg {
  mode: TravelMode;
  meters: number;
  seconds: number;
  geometry: [number, number][];
  /** True when the numbers are modelled rather than routed by a real service. */
  estimated: boolean;
  provider: string;
  summary?: string;
  /** Transit only: what you ride and what you walk, in order. */
  parts?: RoutePart[];
  /** Transit only: long-distance or high-speed rail rather than a city metro. */
  rail?: boolean;
}

/** Seconds spent riding and seconds spent on foot within a transit leg. */
export function splitLeg(leg: RouteLeg): { ride: number; walk: number } {
  if (!leg.parts?.length) {
    return leg.mode === 'walk' ? { ride: 0, walk: leg.seconds } : { ride: leg.seconds, walk: 0 };
  }
  return leg.parts.reduce(
    (a, p) => (p.kind === 'ride' ? { ...a, ride: a.ride + p.seconds } : { ...a, walk: a.walk + p.seconds }),
    { ride: 0, walk: 0 },
  );
}

/** Walk and transit for the same hop, so the day planner can compare them. */
export interface LegOptions {
  walk?: RouteLeg;
  transit?: RouteLeg;
  bike?: RouteLeg;
}

const cache = new Map<string, LegOptions>();
const inflight = new Map<string, Promise<LegOptions>>();

function key(from: LatLng, to: LatLng, modes: TravelMode[]): string {
  const r = (n: number) => n.toFixed(5);
  return `${r(from[0])},${r(from[1])}>${r(to[0])},${r(to[1])}|${modes.join(',')}`;
}

/** Route one hop. Repeat calls for the same hop are served from cache. */
export async function routeLeg(
  from: LatLng,
  to: LatLng,
  modes: TravelMode[] = ['walk', 'transit'],
): Promise<LegOptions> {
  const k = key(from, to, modes);
  const hit = cache.get(k);
  if (hit) return hit;
  const pending = inflight.get(k);
  if (pending) return pending;

  const run = (async () => {
    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, modes }),
      });
      if (!res.ok) return {};
      const body = (await res.json()) as { legs: RouteLeg[] };
      const out: LegOptions = {};
      body.legs.forEach((l) => {
        out[l.mode] = l;
      });
      cache.set(k, out);
      return out;
    } catch {
      return {};
    } finally {
      inflight.delete(k);
    }
  })();

  inflight.set(k, run);
  return run;
}

export function fmtDuration(seconds: number): string {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtDistance(meters: number): string {
  return meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(1) + ' km';
}

/** Which option to suggest: walking wins unless transit saves real time. */
export function betterMode(opts: LegOptions): TravelMode | null {
  const { walk, transit } = opts;
  if (!walk) return transit ? 'transit' : null;
  if (!transit) return 'walk';
  // Short hops aren't worth a station, and transit has to beat walking clearly.
  if (walk.meters < 1200) return 'walk';
  return transit.seconds + 240 < walk.seconds ? 'transit' : 'walk';
}
