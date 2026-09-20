import { NextResponse } from 'next/server';

/**
 * Address → coordinates, via OpenStreetMap Nominatim.
 *
 * Proxied through the server so the browser never hits Nominatim directly:
 * their usage policy requires an identifying User-Agent, and routing it here
 * lets the response be cached instead of re-queried on every keystroke.
 * Swap NOMINATIM_URL for a paid geocoder if the trip gets heavy use.
 */

const ENDPOINT = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org/search';
const CONTACT = process.env.GEOCODER_CONTACT ?? 'japan-trip-planner';

export const runtime = 'nodejs';
export const revalidate = 86400;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ error: 'missing q' }, { status: 400 });

  const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': `TripPlanner/1.0 (${CONTACT})`, 'Accept-Language': 'en' },
      cache: 'force-cache',
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'geocoder unavailable' }, { status: 502 });
    }
    const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (!hits.length) return NextResponse.json({ result: null });
    const hit = hits[0];
    return NextResponse.json({
      result: { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name },
    });
  } catch {
    return NextResponse.json({ error: 'geocoder unreachable' }, { status: 502 });
  }
}
