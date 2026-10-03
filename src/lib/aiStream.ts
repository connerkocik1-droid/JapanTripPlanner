'use client';

/**
 * Talking to the `draft-day` edge function, which answers one JSON object per
 * line.
 *
 * Both things the function does — laying out a day, and suggesting three
 * places — are read the same way, so the reading lives here once. A line only
 * reaches the caller when it is whole: the body arrives in chunks that cut
 * wherever the network felt like cutting, routinely mid-object, and handing
 * half a line to a JSON parser is how a card ends up blank.
 *
 * Nothing here throws. Every failure comes back as a sentence somebody can
 * read, because the only thing a traveler can do about any of them is read it.
 */

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const FUNCTION_URL = BASE
  ? `${BASE.replace(/\/+$/, '')}/functions/v1/draft-day`
  : '';

const TIMEOUT_MS = 90_000;

/** Whether this build can ask at all — the same gate sync uses. */
export function aiConfigured(): boolean {
  return Boolean(FUNCTION_URL);
}

export interface LineStream {
  /** False when nothing was asked, with `message` saying why. */
  ok: boolean;
  message: string;
}

/**
 * Post a request and hand each complete line to `onLine` as it lands.
 *
 * `onLine` returning false stops the read — what a caller does once it has
 * everything it asked for, so a stream that keeps talking does not keep the
 * connection open behind a finished screen.
 */
export async function postLines(
  body: unknown,
  onLine: (raw: Record<string, unknown>) => boolean,
  signal?: AbortSignal,
): Promise<LineStream> {
  if (!FUNCTION_URL) return { ok: false, message: 'This is not set up on this trip yet.' };

  const abort = signal ? anyOf([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abort,
    });
  } catch {
    return { ok: false, message: 'Could not reach the planner. Check your signal and try again.' };
  }

  if (!res.ok || !res.body) {
    const said = await res
      .json()
      .then((j: unknown) => (j as { error?: unknown })?.error)
      .catch(() => null);
    return { ok: false, message: typeof said === 'string' && said ? said : 'That did not work just now.' };
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
        const raw = readLine(line);
        if (raw === null) continue;
        if (!onLine(raw)) return { ok: true, message: '' };
      }
    }
    return { ok: true, message: '' };
  } catch {
    return { ok: false, message: 'That stopped partway. Try it again.' };
  } finally {
    reader.releaseLock();
  }
}

/** One line as an object, or null for a blank or unreadable one. */
export function readLine(line: string): Record<string, unknown> | null {
  const text = line.trim();
  if (!text) return null;
  try {
    const raw: unknown = JSON.parse(text);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** HH:MM, 24-hour, as both halves of this agree to write it. */
export const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The first of several signals to fire. `AbortSignal.any` is too new to rely on. */
export function anyOf(signals: AbortSignal[]): AbortSignal {
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
