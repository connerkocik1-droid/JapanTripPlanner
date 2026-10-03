/**
 * The part of drafting a day that has to be right, kept away from the network.
 *
 * Two jobs. One: pull finished stops out of a tool call that is still being
 * written, so a card can appear the moment its stop is complete rather than
 * when the whole day is. Two: refuse anything that is not one of the trip's
 * own saved places — the model is told which places exist, but what it says
 * is checked against them here before it reaches a phone.
 *
 * Nothing in this file talks to Claude, to Supabase or to the browser, which
 * is why it is the part that is unit-tested.
 */

/** A stop the model proposed, once it has survived checking. */
export interface Suggestion {
  placeId: string;
  /** HH:MM, 24-hour. */
  startTime: string;
  durationMin: number;
  /** One line on why this stop, here, now. Blank when the model gave none. */
  reason: string;
}

const CLOCK = /^(\d{1,2}):([0-5]\d)$/;

/** The shortest and longest a stop may be: a coffee, and most of a day. */
const MIN_DWELL = 15;
const MAX_DWELL = 480;

/** A reason is a line on a card, not a paragraph. */
const MAX_REASON = 160;

/**
 * Read complete `{...}` entries out of the `items` array of a tool input that
 * is still arriving.
 *
 * The scanner is deliberately tolerant: a half-written object is not an error,
 * it is just not ready, so it stays in the buffer and is looked at again when
 * the next delta lands. It never parses the outer object, because the outer
 * object has no closing brace yet.
 */
export function itemScanner(): (chunk: string) => unknown[] {
  let buf = '';
  /** Where to look next: inside the array once it has opened. */
  let at = 0;
  let open = false;
  let closed = false;

  return (chunk: string): unknown[] => {
    buf += chunk;
    const out: unknown[] = [];
    if (closed) return out;

    if (!open) {
      const key = buf.indexOf('"items"');
      if (key < 0) return out;
      const bracket = buf.indexOf('[', key);
      if (bracket < 0) return out;
      at = bracket + 1;
      open = true;
    }

    for (;;) {
      while (at < buf.length && (buf[at] === ',' || /\s/.test(buf[at]))) at += 1;
      if (at >= buf.length) return out;
      if (buf[at] === ']') {
        closed = true;
        return out;
      }
      if (buf[at] !== '{') {
        // Not an object and not the end of the array: the input is not the
        // shape the schema promised, so stop rather than guess at it.
        closed = true;
        return out;
      }
      const end = endOfObject(buf, at);
      if (end < 0) return out; // still being written
      try {
        out.push(JSON.parse(buf.slice(at, end + 1)));
      } catch {
        // A complete-looking object that will not parse is dropped; the stops
        // after it are still worth having.
      }
      at = end + 1;
    }
  };
}

/** The index of the `}` that closes the `{` at `from`, or -1 while unfinished. */
function endOfObject(s: string, from: number): number {
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = from; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Check one proposed stop against the trip's own places.
 *
 * `allowed` is the set of place ids actually saved for the city being planned.
 * An id outside it is not corrected or looked up — it is dropped, because a
 * stop the trip has no place for would accept into the day as a title with
 * nothing on the map under it. The same goes for a place proposed twice.
 */
export function validateSuggestion(
  raw: unknown,
  allowed: Set<string>,
  taken: Set<string>,
): Suggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const placeId = typeof o.place_id === 'string' ? o.place_id : '';
  if (!placeId || !allowed.has(placeId) || taken.has(placeId)) return null;

  const startTime = clockOf(o.start_time);
  if (!startTime) return null;

  const mins = Number(o.duration_min);
  if (!Number.isFinite(mins)) return null;
  const durationMin = Math.min(MAX_DWELL, Math.max(MIN_DWELL, Math.round(mins)));

  const reason = typeof o.reason === 'string'
    ? o.reason.replace(/\s+/g, ' ').trim().slice(0, MAX_REASON)
    : '';

  return { placeId, startTime, durationMin, reason };
}

/** "9:30" and "09:30" both mean half past nine; anything else means nothing. */
function clockOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  const m = CLOCK.exec(value.trim());
  if (!m) return '';
  const h = Number(m[1]);
  if (h > 23) return '';
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** The order a day reads in, whatever order the model wrote the stops in. */
export function byClock(a: Suggestion, b: Suggestion): number {
  return a.startTime.localeCompare(b.startTime);
}
