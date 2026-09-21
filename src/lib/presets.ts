'use client';

import { DEFAULT_DWELL, Place, PlaceKind, TravelMode, blankPlace, uid } from './data';

/**
 * A preset is a ready-made day: an ordered list of stops with coordinates.
 * None ship with the app — drop JSON files in `public/presets/` and list them
 * in `public/presets/index.json`, or import one from a file in the builder.
 */

export interface PresetStop {
  title: string;
  /** Place name as it should appear pinned on the map. */
  place: string;
  kind: PlaceKind;
  addr?: string;
  note?: string;
  band?: string;
  /** [lat, lng]. Without it the stop is added but cannot be routed. */
  ll?: [number, number];
  /** Minutes at this stop; falls back to the default for its kind. */
  dwell?: number;
  /** Suggested way of getting here from the stop before it. */
  mode?: TravelMode;
  /** Per-person cost of the stop itself (ticket, meal estimate). */
  cost?: number;
  time?: string;
}

export interface Preset {
  id: string;
  name: string;
  /** Which city it belongs to, for the builder's filtering. */
  city: string;
  summary?: string;
  stops: PresetStop[];
}

export interface PresetIndex {
  presets: { id: string; name: string; city: string; summary?: string; file: string }[];
}

/** Read `public/presets/index.json`. Missing or malformed means "none yet". */
export async function loadPresetIndex(): Promise<PresetIndex['presets']> {
  try {
    const res = await fetch('/presets/index.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const body = (await res.json()) as Partial<PresetIndex>;
    return Array.isArray(body.presets) ? body.presets : [];
  } catch {
    return [];
  }
}

export async function loadPreset(file: string): Promise<Preset | null> {
  try {
    const res = await fetch(file.startsWith('/') ? file : `/presets/${file}`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return normalizePreset(await res.json());
  } catch {
    return null;
  }
}

export function normalizePreset(input: unknown): Preset | null {
  const p = input as Partial<Preset>;
  if (!p || !Array.isArray(p.stops)) return null;
  return {
    id: p.id || uid(),
    name: p.name || 'Untitled day',
    city: p.city || '',
    summary: p.summary,
    stops: p.stops.map((s) => ({
      title: s.title || s.place || 'Stop',
      place: s.place || s.title || 'Stop',
      kind: (['eat', 'do', 'stay', 'other'] as PlaceKind[]).includes(s.kind) ? s.kind : 'do',
      addr: s.addr ?? '',
      note: s.note ?? '',
      band: s.band ?? '',
      ll: Array.isArray(s.ll) && s.ll.length === 2 ? [Number(s.ll[0]), Number(s.ll[1])] : undefined,
      dwell: Number(s.dwell) || undefined,
      mode: s.mode === 'transit' || s.mode === 'bike' ? s.mode : 'walk',
      cost: Number(s.cost) || 0,
      time: s.time ?? '',
    })),
  };
}

/** A preset stop becomes a pinned place plus a scheduled stop. */
export function stopToPlace(stop: PresetStop): Place {
  return {
    ...blankPlace(stop.kind),
    name: stop.place,
    addr: stop.addr ?? '',
    note: stop.note ?? '',
    band: stop.band ?? '',
    ll: stop.ll ?? null,
  };
}

export function dwellFor(stop: PresetStop): number {
  return stop.dwell ?? DEFAULT_DWELL[stop.kind] ?? 60;
}
