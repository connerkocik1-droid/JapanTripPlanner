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
import { DEFAULT_DWELL, uid, type City, type DayItem, type Place } from './data.ts';
import type { Answers } from '../../supabase/functions/draft-day/questions.ts';

export { aiConfigured as decideConfigured } from './aiStream.ts';

/** One of the three answers, as a card shows it. */
export interface Pick {
  /** Our own id for the card, so turning one down does not disturb the rest. */
  id: string;
  placeId: string;
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
      if (!pick || !ids.has(pick.placeId) || seen.has(pick.placeId)) return true;
      seen.add(pick.placeId);
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
  if (typeof p.placeId !== 'string' || !p.placeId) return null;
  if (typeof p.title !== 'string' || !p.title.trim()) return null;
  if (typeof p.startTime !== 'string' || !CLOCK_RE.test(p.startTime)) return null;

  return {
    id: uid(),
    placeId: p.placeId,
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
