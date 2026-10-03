'use client';

/**
 * "Help me decide": a handful of chips, then three things to do next.
 *
 * The questions themselves are in `supabase/functions/draft-day/questions.ts`,
 * shared with the server so that the chips on screen and the answers the
 * server will accept cannot drift apart. This file is what the phone does with
 * them: work out the context nobody should have to be asked for, send the lot,
 * and read the picks back.
 *
 * Nothing is saved by asking. A pick becomes part of the plan only when
 * somebody taps Add to day.
 */

import { CLOCK_RE, postLines } from './aiStream.ts';
import { blankPlace, DEFAULT_DWELL, uid, type City, type DayItem, type Place } from './data.ts';
import { geocode, hitToLatLng } from './geocode.ts';
import { detailsPatch, type PlaceFacts } from './placeDetails.ts';
import type { Answers } from '../../supabase/functions/draft-day/questions.ts';

export { aiConfigured as decideConfigured } from './aiStream.ts';

/** One of the three answers, as a card shows it. */
export interface Pick {
  /** Our own id for the card, so turning one down does not disturb the rest. */
  id: string;
  /** A saved place of the trip's, or '' when this is somewhere new. */
  placeId: string;
  /** What to look the place up by, when `placeId` is ''. Otherwise ''. */
  query: string;
  title: string;
  reason: string;
  /** US dollars per person; 0 means nothing is charged. */
  costPerPerson: number;
  travelMin: number;
  /** HH:MM, 24-hour. */
  startTime: string;
}

/** Weather as numbers only — the server renders the words from its own table. */
export interface WeatherHint {
  tempF: number;
  rainPct: number;
  code: number;
}

export interface AskOptions {
  /** Minutes past midnight, during the trip. Null when planning ahead. */
  nowMins?: number | null;
  weather?: WeatherHint | null;
  /** Place ids already turned down this round. */
  exclude?: string[];
}

export interface AskHandlers {
  onPick: (pick: Pick) => void;
  onDone: (count: number) => void;
  onError: (message: string) => void;
}

/**
 * Ask for three picks. The promise settles when the stream ends; the picks
 * arrive through `onPick` before then.
 *
 * A pick naming a place this device does not have is dropped on arrival. The
 * server has already checked every id against the saved trip, so this is the
 * second of two checks rather than the only one — but a card whose place is
 * missing here cannot be added to a day, so showing it would be a button that
 * does nothing.
 */
export async function askPicks(
  code: string,
  dayKey: string,
  answers: Answers,
  known: Place[],
  handlers: AskHandlers,
  options: AskOptions = {},
  signal?: AbortSignal,
): Promise<void> {
  const ids = new Set(known.map((p) => p.id));
  const seen = new Set<string>();
  let count = 0;
  let failed = false;

  const result = await postLines(
    {
      action: 'picks',
      code,
      dayKey,
      answers,
      nowMins: options.nowMins ?? null,
      weather: options.weather ?? null,
      exclude: options.exclude ?? [],
    },
    (raw) => {
      if (raw.type === 'error') {
        failed = true;
        handlers.onError(typeof raw.message === 'string' && raw.message ? raw.message : 'That did not work.');
        return false;
      }
      if (raw.type === 'done') {
        handlers.onDone(count);
        return false;
      }
      if (raw.type !== 'pick') return true;
      const pick = readPick(raw.pick);
      // A pick naming a saved place must name one this device actually has;
      // a pick naming somewhere new has nothing to check yet, and is looked
      // up on the way to the card.
      if (!pick) return true;
      const key = pick.placeId || pick.query.toLowerCase();
      if (pick.placeId && !ids.has(pick.placeId)) return true;
      if (seen.has(key)) return true;
      seen.add(key);
      count += 1;
      handlers.onPick(pick);
      return true;
    },
    signal,
  );

  if (failed) return;
  if (!result.ok) {
    // Whatever arrived before it broke is still worth keeping.
    if (count) handlers.onDone(count);
    else handlers.onError(result.message);
    return;
  }
  handlers.onDone(count);
}

/** One pick off the wire, or null when it is missing something a card needs. */
export function readPick(raw: unknown): Pick | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const placeId = typeof p.placeId === 'string' ? p.placeId : '';
  const query = typeof p.query === 'string' ? p.query.trim() : '';
  if (!placeId && !query) return null;
  if (typeof p.title !== 'string' || !p.title.trim()) return null;
  if (typeof p.startTime !== 'string' || !CLOCK_RE.test(p.startTime)) return null;

  return {
    id: uid(),
    placeId,
    query,
    title: p.title.trim(),
    reason: typeof p.reason === 'string' ? p.reason : '',
    costPerPerson: whole(p.costPerPerson),
    travelMin: whole(p.travelMin),
    startTime: p.startTime,
  };
}

function whole(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * A place the trip has not got, as it will be shown and, if accepted, saved.
 *
 * `place` is a real `Place` with real coordinates, or null when nothing could
 * be found. Nothing here comes from the model except the phrase that was
 * searched for: the name, the pin, the photograph, the rating and the hours
 * are all whatever the lookup answered, so a card never states something only
 * because Claude said it.
 */
export interface Found {
  place: Place | null;
  /** Why there is no place, for the one line a card shows instead. */
  problem: string;
}

/** What a found place is filed under, so it reads as the app's own guess. */
const NEW_NOTE = 'Suggested by Help me decide';

/**
 * Look up the place a pick named but the trip has not saved.
 *
 * Two calls, in the order that matters: the map first, because a place with no
 * coordinates cannot go on a day at all, and the details only once there is
 * something to attach them to. The details call is allowed to fail — it is
 * the one that needs a Google key, and a place with a pin and no photograph is
 * still a place you can walk to.
 */
export async function lookUpPick(
  pick: Pick,
  city: City,
  signal?: AbortSignal,
): Promise<Found> {
  const query = pick.query.trim();
  if (!query) return { place: null, problem: '' };

  // The city is appended only when the phrase does not already say it, so
  // "Nishiki Market, Kyoto" is not searched for as "Nishiki Market, Kyoto, Kyoto".
  const asked = query.toLowerCase().includes(city.name.toLowerCase())
    ? query
    : `${query}, ${city.name}`;

  const hit = await geocode(asked);
  if (signal?.aborted) return { place: null, problem: '' };
  if (!hit) return { place: null, problem: 'Could not find this one on the map.' };

  const place: Place = {
    ...blankPlace('eat'),
    name: pick.title || hit.label,
    addr: hit.matched ?? hit.label,
    note: NEW_NOTE,
    ll: hitToLatLng(hit),
  };

  const facts = await lookUpFacts(place, city.name, signal);
  if (signal?.aborted) return { place: null, problem: '' };
  return { place: { ...place, ...detailsPatch(place, facts, today()) }, problem: '' };
}

/** Today as an ISO date, which is all the lookup stamp needs. */
function today(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

/** The same details route the map already uses. Null on anything going wrong. */
async function lookUpFacts(place: Place, city: string, signal?: AbortSignal): Promise<PlaceFacts | null> {
  const params = new URLSearchParams({ name: place.name, kind: place.kind, city });
  if (place.addr) params.set('addr', place.addr);
  if (place.ll) {
    params.set('lat', String(place.ll[0]));
    params.set('lon', String(place.ll[1]));
  }
  try {
    const res = await fetch('/api/place-details?' + params.toString(), { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: PlaceFacts | null };
    return body.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Where to send somebody who is going now.
 *
 * Korea uses Naver — Google Maps cannot route there, so a Google link is worse
 * than useless on the ground in Seoul — and everywhere else uses Google Maps.
 * Both are web links rather than app schemes, because a scheme that has no app
 * behind it opens nothing at all and says nothing about why.
 */
export function goNowUrl(city: City, place: Place): string {
  const name = place.name.trim();
  if (isKorea(city, place)) {
    return 'https://map.naver.com/p/search/' + encodeURIComponent(name || city.name);
  }
  const where = place.ll ? `${place.ll[0]},${place.ll[1]}` : name;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(where);
}

/**
 * Whether this is a Korean city. The currency is what the trip itself says, so
 * it is believed first; the longitude only decides when nobody has set one.
 */
function isKorea(city: City, place: Place): boolean {
  const currency = city.currency.trim().toUpperCase();
  if (currency) return currency === 'KRW';
  const ll = place.ll ?? city.ll;
  return Boolean(ll && ll[0] > 33 && ll[0] < 39 && ll[1] > 124 && ll[1] < 132);
}

/**
 * Turn an accepted pick into a day item — the same shape a stop added by hand
 * has, so the route, the clock and the map treat it identically.
 *
 * The time comes through, because a pick is an answer to "what now" and the
 * hour is half the answer. The reason becomes the stop's note, so the day
 * still says why it has this in it a week later.
 */
export function itemFromPick(pick: Pick, known: Place[]): DayItem | null {
  const place = known.find((p) => p.id === pick.placeId);
  if (!place) return null;
  return {
    id: uid(),
    time: pick.startTime,
    title: place.name || pick.title,
    note: pick.reason,
    cost: Math.max(0, pick.costPerPerson),
    done: false,
    placeId: place.id,
    mode: pick.travelMin > 15 ? 'transit' : 'walk',
    dwell: DEFAULT_DWELL[place.kind] ?? 60,
  };
}

/**
 * Where the day has got to, which is what travel times are measured from and
 * what the sheet says underneath the question.
 */
export function endsAt(city: City, items: DayItem[]): string {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const place = city.places.find((p) => p.id === items[i]?.placeId);
    if (place?.name) return place.name;
  }
  const hotel = city.hotels.find((h) => h.id === city.hotelSel);
  return hotel?.name || city.name;
}
