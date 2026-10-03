'use client';

/**
 * Asking for a day to be drafted, and reading the answer as it arrives.
 *
 * The suggestions come back one JSON object per line from the `draft-day` edge
 * function, which is where the Anthropic key lives. Each line is handed to the
 * caller the moment it lands, so the cards appear one at a time instead of all
 * at once when the day is finished.
 *
 * Nothing here is saved. A suggestion only becomes part of the plan when
 * somebody accepts it, and accepting one goes through the same
 * `applyPlan`-shaped path a hand-built day does.
 */

import { CLOCK_RE, postLines, readLine } from './aiStream.ts';
import { DEFAULT_DWELL, uid, type DayItem, type Place } from './data.ts';

export { aiConfigured as draftingConfigured } from './aiStream.ts';

/** A stop Claude proposed: a saved place, a time, how long, and why. */
export interface Suggestion {
  /** Our own id for the card, so dismissing one does not disturb the rest. */
  id: string;
  placeId: string;
  /** HH:MM, 24-hour. */
  startTime: string;
  durationMin: number;
  reason: string;
}

export interface DraftHandlers {
  /** One finished card, as it arrives. */
  onStop: (stop: Suggestion) => void;
  /** The day is complete. `count` is how many stops survived checking. */
  onDone: (count: number) => void;
  /** Something a traveler should read, in their words rather than the server's. */
  onError: (message: string) => void;
}

/**
 * Draft one day. The promise settles when the stream ends; the stops arrive
 * through `onStop` before then.
 *
 * `place ids` are not trusted from here either — the function checks every one
 * against the trip's saved places before it sends it — but a stop naming a
 * place this device has not got is still dropped on arrival, because a card
 * with nothing behind it cannot be accepted into a day.
 */
export async function draftDay(
  code: string,
  dayKey: string,
  known: Place[],
  handlers: DraftHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const ids = new Set(known.map((p) => p.id));
  const seen = new Set<string>();
  let count = 0;
  let failed = false;

  const result = await postLines(
    { action: 'draft', code, dayKey },
    (raw) => {
      const message = readMessage(raw);
      if (!message) return true;
      if (message.type === 'error') {
        failed = true;
        handlers.onError(message.message);
        return false;
      }
      if (message.type === 'done') {
        handlers.onDone(count);
        return false;
      }
      const stop = message.stop;
      if (!ids.has(stop.placeId) || seen.has(stop.placeId)) return true;
      seen.add(stop.placeId);
      count += 1;
      handlers.onStop(stop);
      return true;
    },
    signal,
  );

  if (failed) return;
  if (!result.ok) {
    // Whatever arrived before it broke is still a day worth looking at.
    if (count) handlers.onDone(count);
    else handlers.onError(result.message);
    return;
  }
  // The stream ended without saying so — whatever arrived still counts.
  handlers.onDone(count);
}

type Message =
  | { type: 'stop'; stop: Suggestion }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** One line of the stream, or null for a blank or unreadable one. */
export function parseLine(line: string): Message | null {
  const raw = readLine(line);
  return raw ? readMessage(raw) : null;
}

/** One already-parsed line, as something the caller can act on. */
function readMessage(o: Record<string, unknown>): Message | null {
  if (o.type === 'done') return { type: 'done' };
  if (o.type === 'error') {
    return {
      type: 'error',
      message: typeof o.message === 'string' && o.message
        ? o.message
        : 'Could not draft that day.',
    };
  }
  if (o.type !== 'stop') return null;

  const s = o.stop as Record<string, unknown> | undefined;
  if (!s || typeof s.placeId !== 'string' || !s.placeId) return null;
  if (typeof s.startTime !== 'string' || !CLOCK_RE.test(s.startTime)) return null;
  const mins = Number(s.durationMin);
  if (!Number.isFinite(mins) || mins <= 0) return null;

  return {
    type: 'stop',
    stop: {
      id: uid(),
      placeId: s.placeId,
      startTime: s.startTime,
      durationMin: Math.round(mins),
      reason: typeof s.reason === 'string' ? s.reason : '',
    },
  };
}

/**
 * Turn accepted suggestions into day items — the same shape a stop added by
 * hand has, so everything downstream (the route, the clock, the map) treats
 * them identically.
 *
 * Only the first stop keeps its time. The rest are left to follow from the
 * routed travel and the dwell, exactly as a day built on the map does, so an
 * accepted draft stays honest about when you would actually arrive.
 */
export function itemsFrom(stops: Suggestion[], known: Place[]): DayItem[] {
  const ordered = stops
    .filter((s) => known.some((p) => p.id === s.placeId))
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return ordered.map((s, i) => {
    const place = known.find((p) => p.id === s.placeId) as Place;
    return {
      id: uid(),
      time: i === 0 ? s.startTime : '',
      title: place.name || 'Stop',
      note: s.reason,
      cost: 0,
      done: false,
      placeId: place.id,
      mode: 'walk' as const,
      dwell: s.durationMin || DEFAULT_DWELL[place.kind] || 60,
    };
  });
}
