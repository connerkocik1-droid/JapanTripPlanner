import { NextResponse } from 'next/server';

/**
 * Point-to-point routing for one leg of a day.
 *
 * Walking and cycling come from a public OSRM instance, so the line follows
 * real streets and the duration is a real routed duration — not a straight
 * line. Transit has no keyless public router with worldwide coverage, so it
 * works one of two ways:
 *
 *   - `TRANSIT_URL` set to a MOTIS-compatible `/api/v1/plan` endpoint (e.g. a
 *     Transitous or self-hosted MOTIS instance): real departures and legs.
 *   - otherwise: a clearly-flagged estimate (`estimated: true`) from the
 *     walking distance, so "walk or metro?" still has an answer offline.
 *
 * A transit leg also comes back split into `parts` — the ride and the walk
 * either side of it — so a caller can show "38 min metro + 12 min walking"
 * rather than one opaque number.
 *
 * The client always gets a usable answer; `provider` and `estimated` say how
 * much to trust it, and the UI labels estimates.
 */

const OSRM = process.env.OSRM_URL ?? 'https://routing.openstreetmap.de';
const TRANSIT_URL = process.env.TRANSIT_URL ?? '';

export const runtime = 'nodejs';

export type Mode = 'walk' | 'bike' | 'transit';

export interface Leg {
  mode: Mode;
  meters: number;
  seconds: number;
  /** [lng, lat] pairs for the map. */
  geometry: [number, number][];
  /** True when the numbers are modelled rather than routed. */
  estimated: boolean;
  provider: string;
  /** Transit only: a short summary such as "Metro · 2 changes". */
  summary?: string;
  /** Transit only: the journey split into what you ride and what you walk. */
  parts?: LegPart[];
}

/** One piece of a transit journey — a ride, or the walk either side of it. */
export interface LegPart {
  kind: 'walk' | 'ride';
  meters: number;
  seconds: number;
  /** The line for a ride ("Keisei Access Express"), or what the walk is for. */
  label?: string;
}

type Pt = [number, number]; // [lat, lng]

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

function haversine(a: Pt, b: Pt): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Straight-line fallback, used when no router can be reached. */
function straightLine(from: Pt, to: Pt, mode: Mode): Leg {
  const direct = haversine(from, to);
  // Street grids are longer than the crow flies.
  const meters = direct * 1.3;
  const speed = mode === 'bike' ? 4.2 : mode === 'transit' ? 8.9 : 1.33; // m/s
  const overhead = mode === 'transit' ? 600 : 0; // walk to the station, wait, exit
  return {
    mode,
    meters: Math.round(meters),
    seconds: Math.round(meters / speed + overhead),
    geometry: [
      [from[1], from[0]],
      [to[1], to[0]],
    ],
    estimated: true,
    provider: 'estimate',
  };
}

/**
 * A modelled metro or rail journey, for when no transit router is configured.
 *
 * Door to door it is three pieces: the walk to a station, the ride, and the
 * walk off at the far end. The ride speed rises with distance because a long
 * run stops far less often than a cross-town metro — an airport express
 * averages something like 70 km/h once it is moving, a city metro half that.
 * Everything here is flagged `estimated`, and the walks either side are the
 * same modelled figures whatever the actual streets look like.
 */
const ACCESS_WALK = { meters: 400, seconds: 330 }; // street to platform
const EGRESS_WALK = { meters: 550, seconds: 450 }; // platform to the door
const WAIT_SECONDS = 300; // one typical headway, plus a change

function rideSpeed(meters: number): number {
  if (meters < 5000) return 7.5; // 27 km/h — metro, stopping often
  if (meters < 20000) return 12; // 43 km/h — commuter rail across a city
  return 20; // 72 km/h — airport express territory
}

/** `streetMeters` is the walking distance for the same hop, when one is known. */
function modelTransit(from: Pt, to: Pt, streetMeters: number): Leg {
  const rideMeters = Math.max(0, streetMeters - ACCESS_WALK.meters - EGRESS_WALK.meters);
  const rideSeconds = Math.round(rideMeters / rideSpeed(rideMeters));
  const parts: LegPart[] = [
    { kind: 'walk', meters: ACCESS_WALK.meters, seconds: ACCESS_WALK.seconds, label: 'to the station' },
    { kind: 'ride', meters: Math.round(rideMeters), seconds: rideSeconds + WAIT_SECONDS, label: 'metro' },
    { kind: 'walk', meters: EGRESS_WALK.meters, seconds: EGRESS_WALK.seconds, label: 'to the door' },
  ];
  return {
    mode: 'transit',
    meters: Math.round(streetMeters),
    seconds: parts.reduce((a, p) => a + p.seconds, 0),
    geometry: [
      [from[1], from[0]],
      [to[1], to[0]],
    ],
    estimated: true,
    provider: 'estimate',
    summary: 'Metro, estimated',
    parts,
  };
}

async function osrm(from: Pt, to: Pt, mode: Mode): Promise<Leg | null> {
  const profile = mode === 'bike' ? 'routed-bike' : 'routed-foot';
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
  const url = `${OSRM}/${profile}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      code: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
    };
    const r = body.routes?.[0];
    if (body.code !== 'Ok' || !r) return null;
    return {
      mode,
      meters: Math.round(r.distance),
      seconds: Math.round(r.duration),
      geometry: r.geometry.coordinates,
      estimated: false,
      provider: 'osrm',
    };
  } catch {
    return null;
  }
}

interface MotisLeg {
  mode?: string;
  distance?: number;
  duration?: number;
  routeShortName?: string;
  legGeometry?: { points?: string };
  from?: { lat: number; lon: number };
  to?: { lat: number; lon: number };
}

/** Google's encoded-polyline format, which MOTIS returns for leg geometry. */
function decodePolyline(str: string, precision = 5): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < str.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

async function motis(from: Pt, to: Pt): Promise<Leg | null> {
  if (!TRANSIT_URL) return null;
  const qs = new URLSearchParams({
    fromPlace: `${from[0]},${from[1]}`,
    toPlace: `${to[0]},${to[1]}`,
    numItineraries: '1',
  });
  try {
    const res = await fetch(`${TRANSIT_URL}?${qs}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      itineraries?: { duration?: number; legs?: MotisLeg[] }[];
    };
    const it = body.itineraries?.[0];
    if (!it?.legs?.length) return null;

    const geometry: [number, number][] = [];
    let meters = 0;
    const rides: string[] = [];
    const parts: LegPart[] = [];
    it.legs.forEach((leg) => {
      meters += leg.distance ?? 0;
      const pts = leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [];
      if (pts.length) geometry.push(...pts);
      else if (leg.from && leg.to) geometry.push([leg.from.lon, leg.from.lat], [leg.to.lon, leg.to.lat]);
      const m = (leg.mode ?? '').toUpperCase();
      const walking = !m || m === 'WALK';
      if (!walking) rides.push(leg.routeShortName || m.toLowerCase());
      parts.push({
        kind: walking ? 'walk' : 'ride',
        meters: Math.round(leg.distance ?? 0),
        seconds: Math.round(leg.duration ?? 0),
        label: walking ? undefined : leg.routeShortName || m.toLowerCase(),
      });
    });

    return {
      mode: 'transit',
      meters: Math.round(meters),
      seconds: Math.round(it.duration ?? 0),
      geometry,
      estimated: false,
      provider: 'motis',
      summary: rides.length ? rides.join(' → ') : 'Walk only',
      parts,
    };
  } catch {
    return null;
  }
}

function validPoint(v: unknown): v is Pt {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Math.abs(v[0]) <= 90 &&
    Math.abs(v[1]) <= 180
  );
}

export async function POST(req: Request) {
  let body: { from?: unknown; to?: unknown; modes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const { from, to } = body;
  if (!validPoint(from) || !validPoint(to)) {
    return NextResponse.json({ error: 'from and to must be [lat, lng]' }, { status: 400 });
  }
  const modes: Mode[] =
    Array.isArray(body.modes) && body.modes.length
      ? (body.modes.filter((m): m is Mode => m === 'walk' || m === 'bike' || m === 'transit'))
      : ['walk', 'transit'];

  // Both options are fetched together so the UI can compare them side by side.
  const legs = await Promise.all(
    modes.map(async (mode) => {
      if (mode === 'transit') {
        const viaMotis = await motis(from, to);
        if (viaMotis) return viaMotis;
        const walk = await osrm(from, to, 'walk');
        // Model the metro off the real walking distance when one is available.
        const base = walk ?? straightLine(from, to, 'walk');
        return modelTransit(from, to, base.meters);
      }
      return (await osrm(from, to, mode)) ?? straightLine(from, to, mode);
    }),
  );

  return NextResponse.json({ legs });
}
