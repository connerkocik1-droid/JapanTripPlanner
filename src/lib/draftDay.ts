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

import { DEFAULT_DWELL, uid, type DayItem, type Place } from './data.ts';

const FUNCTION_URL = (() => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base.replace(/\/+$/, '')}/functions/v1/draft-day` : '';
})();

const TIMEOUT_MS = 90_000;

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

/** Whether a build can draft a day at all — the same gate sync uses. */
export function draftingConfigured(): boolean {
  return Boolean(FUNCTION_URL);
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
  if (!FUNCTION_URL) {
    handlers.onError('Drafting a day is not set up on this trip yet.');
    return;
  }

  const ids = new Set(known.map((p) => p.id));
  const seen = new Set<string>();
  let count = 0;

  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const abort = signal ? anyOf([signal, timeout]) : timeout;

  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, dayKey }),
      signal: abort,
    });
  } catch {
    handlers.onError('Could not reach the planner. Check your signal and try again.');
    return;
  }

  if (!res.ok || !res.body) {
    const said = await res
      .json()
      .then((j: unknown) => (j as { error?: unknown })?.error)
      .catch(() => null);
    handlers.onError(typeof said === 'string' && said ? said : 'Could not draft that day.');
    return;
  }

  const reader = res.body.getReader();
  const decode = new TextDecoder();
  let buf = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decode.decode(value, { stream: true });
      const lines = buf.split('\n');
      // Whatever follows the last newline is half a line; keep it for next time.
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const message = parseLine(line);
        if (!message) continue;
        if (message.type === 'error') {
          handlers.onError(message.message);
          return;
        }
        if (message.type === 'done') {
          handlers.onDone(count);
          return;
        }
        const stop = message.stop;
        if (!ids.has(stop.placeId) || seen.has(stop.placeId)) continue;
        seen.add(stop.placeId);
        count += 1;
        handlers.onStop(stop);
      }
    }
    // The stream ended without saying so — whatever arrived still counts.
    handlers.onDone(count);
  } catch {
    if (count) handlers.onDone(count);
    else handlers.onError('That draft stopped partway. Try it again.');
  } finally {
    reader.releaseLock();
  }
}

type Message =
  | { type: 'stop'; stop: Suggestion }
  | { type: 'done' }
  | { type: 'error'; message: string };

/** One line of the stream, or null for a blank or unreadable one. */
export function parseLine(line: string): Message | null {
  const text = line.trim();
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

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
  if (typeof s.startTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.startTime)) return null;
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

/** The first of several signals to fire. `AbortSignal.any` is too new to rely on. */
function anyOf(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}
