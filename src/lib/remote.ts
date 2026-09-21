'use client';

/**
 * The shared copy of the plan.
 *
 * The device copy in `storage.ts` stays the one the app reads and writes; this
 * is a second place the same document is kept so it can follow you to another
 * phone or laptop. There is no account and no password, which is deliberate:
 * a long random trip code is the key, it travels in a link, and each device
 * remembers it after the first visit.
 *
 * The database never exposes the table itself. Both calls below go through a
 * function that takes the code, so a client cannot list what trips exist or
 * read one without already holding its code.
 *
 * Nothing here throws, and every call returns null when the shared copy cannot
 * be reached. A trip with no sync configured, or a phone with no signal, keeps
 * working exactly as it did before — on its own device copy.
 */

const REMOTE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// The Vercel integration and the Supabase dashboard do not agree on what to
// call the browser-safe key, so take whichever name is present. These have to
// be written out in full: the bundler replaces each one literally.
const REMOTE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

const CODE_KEY = 'trip-planner:code';
const TIMEOUT_MS = 10_000;

/** Whether this build has somewhere to sync to. */
export function syncConfigured(): boolean {
  return Boolean(REMOTE_URL && REMOTE_KEY);
}

/** 128 bits of randomness, hex encoded — long enough that it cannot be guessed. */
function newCode(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function readStoredCode(): string | null {
  try {
    const saved = window.localStorage.getItem(CODE_KEY);
    return saved && /^[a-f0-9]{32,}$/.test(saved) ? saved : null;
  } catch {
    return null;
  }
}

function storeCode(code: string): void {
  try {
    window.localStorage.setItem(CODE_KEY, code);
  } catch {
    /* storage blocked — this device just will not remember the trip */
  }
}

/**
 * The trip this device is on.
 *
 * A code in the address bar wins and is remembered: that is how a second
 * device joins an existing trip. It is then taken back out of the address bar,
 * so the key does not sit in history or in a screenshot of the page.
 */
export function resolveCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const found = window.location.hash.match(/[#&]t=([a-f0-9]{32,})/i);
    if (found) {
      const code = found[1].toLowerCase();
      storeCode(code);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return code;
    }
  } catch {
    /* fall through to whatever this device already had */
  }
  return readStoredCode();
}

/** The trip this device is on, starting a new one if it has never had a code. */
export function ensureCode(): string | null {
  if (!syncConfigured() || typeof window === 'undefined') return null;
  const existing = resolveCode();
  if (existing) return existing;
  const code = newCode();
  storeCode(code);
  return code;
}

/** The link that puts another device on this same trip. */
export function shareLink(code: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}#t=${code}`;
}

export interface RemoteDoc {
  doc: unknown;
  rev: number;
  updatedAt: string;
}

async function rpc<T>(fn: string, body: unknown): Promise<T | null> {
  if (!REMOTE_URL || !REMOTE_KEY) return null;
  try {
    const res = await fetch(`${REMOTE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: REMOTE_KEY,
        Authorization: `Bearer ${REMOTE_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Offline, blocked, or the project is asleep. The device copy carries on.
    return null;
  }
}

interface Row {
  doc: unknown;
  rev: number;
  updated_at: string;
  accepted?: boolean;
}

function firstRow(rows: unknown): Row | null {
  return Array.isArray(rows) && rows.length ? (rows[0] as Row) : null;
}

/** The shared copy, or null if there is not one yet or it cannot be reached. */
export async function pullTrip(code: string): Promise<RemoteDoc | null> {
  const row = firstRow(await rpc<unknown>('trip_pull', { p_code: code }));
  if (!row) return null;
  return { doc: row.doc, rev: row.rev, updatedAt: row.updated_at };
}

export interface PushResult {
  /** False when a newer revision was already there, which `remote` then holds. */
  accepted: boolean;
  remote: RemoteDoc;
}

/**
 * Offer a revision to the shared copy. A revision older than the one already
 * stored is refused rather than overwriting it, and the stored one comes back
 * so the caller can take it instead.
 */
export async function pushTrip(
  code: string,
  doc: unknown,
  rev: number,
): Promise<PushResult | null> {
  const row = firstRow(await rpc<unknown>('trip_push', { p_code: code, p_doc: doc, p_rev: rev }));
  if (!row) return null;
  return {
    accepted: Boolean(row.accepted),
    remote: { doc: row.doc, rev: row.rev, updatedAt: row.updated_at },
  };
}
