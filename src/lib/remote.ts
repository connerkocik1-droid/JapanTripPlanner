'use client';

/**
 * The shared copy of the plan.
 *
 * The device copy in `storage.ts` stays the one the app reads and writes; this
 * is a second place the same document is kept so it can follow you to another
 * phone or laptop. There is no account and no password, which is deliberate:
 * a long random trip code is the key, it travels in a link, and each device
 * remembers it after the first visit. Which trips a device knows about is
 * `trips.ts`; this file only talks to the server.
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

const TIMEOUT_MS = 10_000;

/** Whether this build has somewhere to sync to. */
export function syncConfigured(): boolean {
  return Boolean(REMOTE_URL && REMOTE_KEY);
}

export interface RemoteDoc {
  doc: unknown;
  rev: number;
  updatedAt: string;
  /** The short code this trip can be joined with, or '' when it has none. */
  joinCode: string;
}

/** A call and what came back, including why the server said no. */
interface Answer {
  ok: boolean;
  rows: unknown;
  /** The server's own words when it refused, for the one place a user sees them. */
  message: string;
}

async function call(fn: string, body: unknown): Promise<Answer> {
  if (!REMOTE_URL || !REMOTE_KEY) return { ok: false, rows: null, message: '' };
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
    const payload: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = payload as { message?: unknown } | null;
      return {
        ok: false,
        rows: null,
        message: typeof err?.message === 'string' ? err.message : '',
      };
    }
    return { ok: true, rows: payload, message: '' };
  } catch {
    // Offline, blocked, or the project is asleep. The device copy carries on.
    return { ok: false, rows: null, message: '' };
  }
}

async function rpc<T>(fn: string, body: unknown): Promise<T | null> {
  const answer = await call(fn, body);
  return answer.ok ? (answer.rows as T) : null;
}

interface Row {
  doc: unknown;
  rev: number;
  updated_at: string;
  join_code?: string | null;
  accepted?: boolean;
}

function firstRow(rows: unknown): Row | null {
  return Array.isArray(rows) && rows.length ? (rows[0] as Row) : null;
}

/** The shared copy, or null if there is not one yet or it cannot be reached. */
export async function pullTrip(code: string): Promise<RemoteDoc | null> {
  const row = firstRow(await rpc<unknown>('trip_pull', { p_code: code }));
  if (!row) return null;
  return {
    doc: row.doc,
    rev: row.rev,
    updatedAt: row.updated_at,
    joinCode: typeof row.join_code === 'string' ? row.join_code : '',
  };
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
    remote: {
      doc: row.doc,
      rev: row.rev,
      updatedAt: row.updated_at,
      joinCode: typeof row.join_code === 'string' ? row.join_code : '',
    },
  };
}

/**
 * Exchange a short code for the trip's real key — how a device that has never
 * seen a trip gets onto it without a link. Null when no trip has that code, or
 * when too many wrong guesses have come from here lately.
 */
export async function joinTrip(short: string): Promise<string | null> {
  const rows = await rpc<unknown>('trip_join', { p_join_code: short });
  if (!Array.isArray(rows) || !rows.length) return null;
  const row = rows[0] as { code?: unknown };
  return typeof row?.code === 'string' ? row.code : null;
}

/** Set or clear the short code, which needs the long one in hand. */
export async function setJoinCode(
  code: string,
  short: string,
): Promise<{ ok: boolean; joinCode: string; message: string }> {
  const answer = await call('trip_set_join_code', { p_code: code, p_join_code: short });
  if (!answer.ok) {
    return {
      ok: false,
      joinCode: '',
      // The unique index speaks in Postgres; everyone else speaks plainly.
      message: /duplicate key|unique/i.test(answer.message)
        ? 'Another trip already uses that code.'
        : answer.message || 'Could not reach the trip right now.',
    };
  }
  const rows = answer.rows;
  const row = Array.isArray(rows) && rows.length ? (rows[0] as { join_code?: unknown }) : null;
  return {
    ok: true,
    joinCode: typeof row?.join_code === 'string' ? row.join_code : '',
    message: '',
  };
}
