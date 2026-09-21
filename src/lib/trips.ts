'use client';

/**
 * The trips this device knows about.
 *
 * A trip is identified by a long random code, and that code is the only thing
 * that opens it — there is no account to sign in to. A device remembers the
 * trips it has been shown, so after the first visit picking one is a tap
 * rather than a link.
 *
 * Nothing here talks to the network. `remote.ts` does that; this is only the
 * device's own memory of what it has seen.
 */

export interface TripRef {
  code: string;
  /** What to call it in the picker. Empty until the plan is named. */
  name: string;
}

const LIST_KEY = 'trip-planner:trips';
const ACTIVE_KEY = 'trip-planner:code';

/** A code is 128 bits, hex encoded — long enough that it cannot be guessed. */
const CODE_RE = /^[a-f0-9]{32,}$/;

export function newCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isCode(v: unknown): v is string {
  return typeof v === 'string' && CODE_RE.test(v);
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked — this device just will not remember between visits */
  }
}

/** The trips this device has seen, most recently opened first. */
export function knownTrips(): TripRef[] {
  const raw = read<unknown>(LIST_KEY);
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TripRef[] = [];
  for (const item of raw) {
    const t = item as Partial<TripRef>;
    if (!isCode(t?.code) || seen.has(t.code)) continue;
    seen.add(t.code);
    out.push({ code: t.code, name: typeof t.name === 'string' ? t.name : '' });
  }
  return out;
}

/**
 * Note a trip on this device, or update the name it is listed under. The most
 * recently remembered trip sorts first, which is the one the picker offers.
 */
export function rememberTrip(code: string, name = ''): void {
  if (!isCode(code)) return;
  const known = knownTrips();
  const was = known.find((t) => t.code === code);
  // A blank name from a plan that has not been titled yet should not erase the
  // name this device already had for it.
  const ref: TripRef = { code, name: name || was?.name || '' };
  write(LIST_KEY, [ref, ...known.filter((t) => t.code !== code)]);
}

/** Take a trip off this device. The trip itself is untouched. */
export function forgetTrip(code: string): void {
  write(LIST_KEY, knownTrips().filter((t) => t.code !== code));
  if (activeCode() === code) setActiveCode(null);
}

/** The trip this device is currently on, or null when none is chosen. */
export function activeCode(): string | null {
  try {
    const saved = window.localStorage.getItem(ACTIVE_KEY);
    return isCode(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function setActiveCode(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(ACTIVE_KEY, code);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* storage blocked — the picker just asks again next visit */
  }
}

/**
 * A code arriving in the address bar: how a second device joins a trip it has
 * never seen. It is remembered and then taken back out of the bar, so the key
 * does not sit in history or in a screenshot of the page.
 */
export function codeFromLink(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const found = window.location.hash.match(/[#&]t=([a-f0-9]{32,})/i);
    if (!found) return null;
    const code = found[1].toLowerCase();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    rememberTrip(code);
    return code;
  } catch {
    return null;
  }
}

/** The link that puts another device on this trip. */
export function shareLink(code: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}#t=${code}`;
}
