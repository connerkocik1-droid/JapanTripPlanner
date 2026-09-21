'use client';

import { Place, PlaceKind, uid } from './data';

/**
 * A place pack is a ready-made shortlist: somewhere's restaurants, its museums,
 * its coffee. Unlike a preset it is not a day — nothing is ordered and nothing
 * is scheduled. Importing one pins every entry on the map, and the travelers
 * decide afterwards which of them a day is built out of.
 *
 * Packs live in `public/places/` and are listed in `public/places/index.json`.
 * They carry addresses rather than coordinates on purpose: an address is what
 * a person can check against a listing, and resolving it here means the pin
 * comes from the same geocoder as every other pin in the app rather than from
 * a number somebody typed once.
 */

export interface PackPlace {
  name: string;
  /** The name in the local script, when it differs — worth showing a taxi. */
  korean?: string;
  addr: string;
  kind?: PlaceKind;
  /** "4.7★", "$$" — whatever the shortlist was ranked on. */
  band?: string;
  note?: string;
  url?: string;
  images?: string[];
}

export interface PlacePack {
  id: string;
  name: string;
  /** Which city it belongs to, matched against the city's name. */
  city: string;
  summary?: string;
  source?: string;
  places: PackPlace[];
}

export interface PackListing {
  id: string;
  name: string;
  city: string;
  summary?: string;
  file: string;
  count?: number;
}

/** Read `public/places/index.json`. Missing or malformed means "none yet". */
export async function loadPackIndex(): Promise<PackListing[]> {
  try {
    const res = await fetch('/places/index.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const body = (await res.json()) as { packs?: PackListing[] };
    return Array.isArray(body.packs) ? body.packs : [];
  } catch {
    return [];
  }
}

export async function loadPack(file: string): Promise<PlacePack | null> {
  try {
    const res = await fetch(file.startsWith('/') ? file : `/places/${file}`, { cache: 'no-cache' });
    if (!res.ok) return null;
    return normalizePack(await res.json());
  } catch {
    return null;
  }
}

const KINDS: PlaceKind[] = ['eat', 'do', 'stay', 'other'];

export function normalizePack(input: unknown): PlacePack | null {
  const p = input as Partial<PlacePack>;
  if (!p || !Array.isArray(p.places)) return null;
  const places = p.places
    .filter((s) => typeof s?.name === 'string' && s.name.trim())
    .map((s) => ({
      name: s.name.trim(),
      korean: typeof s.korean === 'string' ? s.korean.trim() : '',
      addr: typeof s.addr === 'string' ? s.addr.trim() : '',
      kind: KINDS.includes(s.kind as PlaceKind) ? (s.kind as PlaceKind) : ('eat' as PlaceKind),
      band: typeof s.band === 'string' ? s.band : '',
      note: typeof s.note === 'string' ? s.note : '',
      url: typeof s.url === 'string' ? s.url : '',
      images: Array.isArray(s.images) ? s.images.filter((x): x is string => typeof x === 'string') : [],
    }));
  if (!places.length) return null;
  return {
    id: p.id || uid(),
    name: p.name || 'Places',
    city: p.city || '',
    summary: p.summary,
    source: p.source,
    places,
  };
}

/**
 * A pack entry becomes a pinned place with no coordinates yet — the importer
 * resolves the address and fills them in, one at a time.
 */
export function packPlaceToPlace(entry: PackPlace): Place {
  // The local-script name rides along in the note: it is the one thing worth
  // being able to point at when the English name gets you nowhere.
  const note = [entry.note, entry.korean].filter((s) => s && s.trim()).join(' · ');
  return {
    id: uid(),
    name: entry.name,
    addr: entry.addr ?? '',
    note,
    kind: entry.kind ?? 'eat',
    band: entry.band ?? '',
    images: entry.images ?? [],
    url: entry.url ?? '',
    ll: null,
  };
}

/** Packs offered for a city, matched on its name. An unlabelled pack fits any. */
export function packsFor(list: PackListing[], cityName: string): PackListing[] {
  const name = cityName.trim().toLowerCase();
  return list.filter((p) => !p.city || p.city.trim().toLowerCase() === name);
}
