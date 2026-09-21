import { NextResponse } from 'next/server';
import { GeocodePrecision, queryLadder } from '@/lib/addressQuery';

/**
 * Address → coordinates, via OpenStreetMap Nominatim.
 *
 * Proxied through the server so the browser never hits Nominatim directly:
 * their usage policy requires an identifying User-Agent, and routing it here
 * lets the response be cached instead of re-queried on every keystroke.
 * Swap NOMINATIM_URL for a paid geocoder if the trip gets heavy use.
 *
 * A typed address rarely matches on the first try. Korean addresses in
 * particular carry a floor and a building ("2F Hilltop Bldg, 19 Dosan-daero
 * 67-gil") that Nominatim has never heard of, and plenty of them are lot
 * numbers rather than roads. So the query is tried in widening steps, and the
 * answer says which step matched: a pin the traveler should check before
 * counting on it is worth marking as one, rather than quietly dropping a
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

/** A hit that is only a suburb or a district is an area match however it was asked for. */
function precisionOf(hit: Hit, asked: GeocodePrecision): GeocodePrecision {
  const what = (hit.addresstype || hit.type || '').toLowerCase();
  if (/^(suburb|quarter|neighbourhood|city_district|district|borough|city|town|village|county|state)$/.test(what)) {
    return 'area';
  }
  if (what === 'road' || hit.category === 'highway') return asked === 'exact' ? 'road' : asked;
  return asked;
}

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
    for (const step of queryLadder(q)) {
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
