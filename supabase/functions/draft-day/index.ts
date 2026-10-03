/**
 * "Draft this day" — Claude lays out an empty day from the places the
 * travellers have already saved, and the cards appear one at a time.
 *
 * The Anthropic key lives here and only here. It is read from the function's
 * own secrets, so it is never in the bundle the browser downloads and never in
 * the repository.
 *
 * This endpoint is open to the internet with no login, because the app has no
 * login: a trip is protected by its 128-bit code and nothing else. Three
 * things keep it from becoming a free Claude proxy for whoever finds the URL.
 *
 *   1. A caller must hold a trip code that actually names a saved trip. The
 *      check is a real read of that trip, not a shape test.
 *   2. The caller sends no text. It names a day — a city id and a night — and
 *      every word the model sees is built here from the saved trip. There is
 *      no field a prompt of someone else's choosing could arrive in.
 *   3. Calls are counted, per trip and per caller, and refused past a
 *      sensible rate.
 *
 * What comes back is one JSON object per line: a `stop` as each one is
 * finished, then a single `done`. Streaming line by line rather than returning
 * a day is the point — on a phone the first card lands in a second or two
 * instead of the whole thing landing in fifteen.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@^0.131.0';
import { PROPOSE_DAY, SYSTEM, briefFor, type Doc } from './brief.ts';
import { byClock, itemScanner, validateSuggestion, type Suggestion } from './suggestions.ts';

/** The trip code is 128 bits of randomness, written as 32 hex characters. */
const MIN_CODE = 32;

/** Per trip, and per caller, in their windows. Generous for a real day's planning. */
const PER_TRIP = { limit: 12, windowMs: 10 * 60_000 };
const PER_CALLER = { limit: 40, windowMs: 60 * 60_000 };

const MODEL = 'claude-opus-5-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Recent calls, by trip code and by caller.
 *
 * This lives in the isolate, so it is a ceiling per running instance rather
 * than a global one. That is the right trade here: the only way to reach this
 * endpoint at all is to already hold a trip code, so the counter is there to
 * stop one holder from running up a bill, not to stand between the function
 * and the open internet. Counting in the database would mean a table, and the
 * trip's own schema is deliberately left alone.
 */
const seen = new Map<string, number[]>();

function withinRate(key: string, rule: { limit: number; windowMs: number }): boolean {
  const now = Date.now();
  const hits = (seen.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (hits.length >= rule.limit) {
    seen.set(key, hits);
    return false;
  }
  hits.push(now);
  seen.set(key, hits);
  if (seen.size > 5_000) {
    // Nothing here is worth keeping across a quiet spell.
    for (const [k, v] of seen) if (!v.some((t) => now - t < PER_CALLER.windowMs)) seen.delete(k);
  }
  return true;
}

function refuse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** The trip as the database has it, or null when no trip has that code. */
async function pullTrip(code: string): Promise<Doc | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SB_PUBLISHABLE_KEY');
  if (!url || !key) return null;

  const res = await fetch(`${url}/rest/v1/rpc/trip_pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ p_code: code }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows) || !rows.length) return null;
  const doc = (rows[0] as { doc?: unknown }).doc;
  return doc && typeof doc === 'object' ? (doc as Doc) : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return refuse(405, 'Use POST.');

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return refuse(503, 'Drafting a day is not set up on this trip yet.');

  const body = (await req.json().catch(() => null)) as
    | { code?: unknown; dayKey?: unknown }
    | null;
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  const dayKey = typeof body?.dayKey === 'string' ? body.dayKey.trim() : '';
  if (code.length < MIN_CODE || !dayKey) return refuse(400, 'Which day?');

  const caller = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (!withinRate(`trip:${code}`, PER_TRIP) || !withinRate(`ip:${caller}`, PER_CALLER)) {
    return refuse(429, 'That is a lot of drafting. Give it a few minutes.');
  }

  // The code has to name a real trip before a single token is spent.
  const doc = await pullTrip(code);
  if (!doc) return refuse(403, 'That trip could not be opened.');

  const brief = briefFor(doc, dayKey);
  if (!brief) return refuse(404, 'That is not a day of this trip.');
  if (!brief.allowed.size) {
    return refuse(409, `Pin a few places in ${brief.cityName} first and this can draft from them.`);
  }

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      const taken = new Set<string>();
      let dropped = 0;
      let kept: Suggestion[] = [];

      try {
        const claude = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          // A day of four stops from a short list is not hard reasoning, and
          // the first card should land while the phone is still in your hand.
          output_config: { effort: 'low' },
          system: SYSTEM,
          tools: [PROPOSE_DAY],
          // Forced tool choice is refused on this model, so the tool is named
          // in the system prompt instead and the schema is strict.
          tool_choice: { type: 'auto' },
          messages: [{ role: 'user', content: brief.prompt }],
          stream: true,
        });

        const scan = itemScanner();
        for await (const event of claude) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'input_json_delta'
          ) {
            // The input streams as it is written, so it is routinely invalid
            // JSON mid-flight and may be truncated for good if the model runs
            // out of room. The scanner only ever hands back whole stops.
            for (const raw of scan(event.delta.partial_json)) {
              const stop = validateSuggestion(raw, brief.allowed, taken);
              if (!stop) {
                dropped += 1;
                continue;
              }
              taken.add(stop.placeId);
              kept.push(stop);
              send({ type: 'stop', stop });
            }
          } else if (event.type === 'message_delta' && event.delta.stop_reason === 'refusal') {
            send({ type: 'error', message: 'Claude would not draft that day.' });
            controller.close();
            return;
          }
        }

        kept = kept.sort(byClock);
        send({ type: 'done', count: kept.length, dropped, date: brief.date });
      } catch (err) {
        const message = err instanceof Anthropic.APIError && err.status === 429
          ? 'Claude is busy right now. Try that again in a minute.'
          : 'Could not draft that day just now.';
        send({ type: 'error', message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the refusal path above.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      // One JSON object per line, read as it arrives.
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
});
