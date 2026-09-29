import { NextResponse } from 'next/server';
import { GeocodePrecision, coarser, queryLadder } from '@/lib/addressNormalize';

/**
 * Address → coordinates, via OpenStreetMap Nominatim.
 *
 * Proxied through the server so the browser never hits Nominatim directly:
 * their usage policy requires an identifying User-Agent, and routing it here
 * lets the response be cached instead of re-queried on every keystroke.
 * Swap NOMINATIM_URL for a paid geocoder if the trip gets heavy use.
 *
 * A typed address rarely matches on the first try, and a Korean or Japanese one
 * almost never does as written. `addressNormalize` takes the address apart and
 * hands back the ways to ask, narrowest first, each labelled with how exact an
 * answer from it could honestly be. This route walks that list and reports both
 * the query that matched and what it was worth: a pin the traveler should check
 * before counting on it is worth marking as one, rather than quietly dropping a
 * restaurant onto the middle of its district.
 */

const ENDPOINT = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org/search';
const CONTACT = process.env.GEOCODER_CONTACT ?? 'japan-trip-planner';

export const runtime = 'nodejs';
export const revalidate = 86400;

/** The shape of a Nominatim answer, as much of it as matters here. */
interface Hit {
  lat: string;
  lon: string;
  display_name: string;
  /** Nominatim's own classification of what it matched. */
  category?: string;
  type?: string;
  addresstype?: string;
}

/**
 * How exact the answer really is: the vaguer of what was asked and what came
 * back. A district-shaped hit is an area match however precisely it was asked
 * for, and a chome or a quarter is a block — neither is the door.
 */
function precisionOf(hit: Hit, asked: GeocodePrecision): GeocodePrecision {
  const what = (hit.addresstype || hit.type || '').toLowerCase();
  if (/^(city_district|district|borough|city|town|village|county|state|province|municipality)$/.test(what)) {
    return 'area';
  }
  if (/^(suburb|quarter|neighbourhood|city_block|residential)$/.test(what)) return coarser(asked, 'block');
  if (what === 'road' || hit.category === 'highway') return coarser(asked, 'road');
  return asked;
}

/**
 * Nominatim asks for no more than a request a second, and a widening ladder can
 * be several. The first rung is asked at once, so an address that already works
 * is as quick as it ever was; the rest are paced, because an address that needs
 * the whole ladder is being resolved in the background anyway.
 */
const RUNG_GAP_MS = 1100;

async function ask(q: string): Promise<Hit | null> {
  const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': `TripPlanner/1.0 (${CONTACT})`, 'Accept-Language': 'en' },
    cache: 'force-cache',
  });
  if (!res.ok) throw new Error('geocoder ' + res.status);
  const hits = (await res.json()) as Hit[];
  return hits[0] ?? null;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });

  try {
    const ladder = queryLadder(q);
    for (let i = 0; i < ladder.length; i += 1) {
      const step = ladder[i];
      if (i > 0) await new Promise((r) => setTimeout(r, RUNG_GAP_MS));
      const hit = await ask(step.q);
      if (!hit) continue;
      return NextResponse.json({
        result: {
          lat: Number(hit.lat),
          lng: Number(hit.lon),
          label: hit.display_name,
          precision: precisionOf(hit, step.precision),
          /** What actually matched, so the traveler can see what was searched. */
          matched: step.q,
        },
      });
    }
    return NextResponse.json({ result: null });
  } catch {
    return NextResponse.json({ error: 'geocoder unreachable' }, { status: 502 });
  }
}
