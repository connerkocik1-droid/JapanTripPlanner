/**
 * "Ask the other one too" — one traveler inviting the other to answer
 * "Help me decide" with them.
 *
 * The invitation rides in the trip document, which already goes both ways
 * between the two phones every twenty seconds while the app is open. That is
 * the whole transport: no socket, no second table, nothing new to keep
 * working. A question somebody has to pick their phone up to answer does not
 * need to arrive faster than that.
 *
 * Pure types and pure functions, so both halves of the app can agree on what
 * counts as a live invitation.
 */

import type { PersonId } from './people.ts';
import { PERSON_LIST } from './people.ts';

export interface Ask {
  id: string;
  /** `cityId:nightIndex` — the day being decided. */
  dayKey: string;
  /** Who asked, and is waiting on the answer. */
  by: PersonId;
  at: number;
  /** The asker's own answers, as chip ids. */
  answers: Record<string, string>;
  /** The other traveler's answers, once they have given them. Null until then. */
  reply: Record<string, string> | null;
  repliedAt: number | null;
}

/**
 * How long an invitation stands.
 *
 * "What shall we do now" is a question about the next hour or two. Past that
 * the honest thing is to let it lapse rather than have somebody answer a
 * question that was settled over dinner.
 */
export const ASK_GOOD_FOR_MS = 2 * 60 * 60 * 1000;

export function fresh(ask: Ask, now: number = Date.now()): boolean {
  return now - ask.at < ASK_GOOD_FOR_MS;
}

/**
 * An invitation from the other traveler, waiting on an answer from me.
 *
 * My own invitations are not offered back to me, and one that has already been
 * answered is finished — the asker's phone is what takes it down, so a second
 * answer would otherwise overwrite the first.
 */
export function askFor(
  asks: Ask[],
  dayKey: string,
  me: PersonId,
  now: number = Date.now(),
): Ask | null {
  return (
    asks.find((a) => a.dayKey === dayKey && a.by !== me && !a.reply && fresh(a, now)) ?? null
  );
}

/** My own invitation on this day, answered or not. */
export function myAsk(
  asks: Ask[],
  dayKey: string,
  me: PersonId,
  now: number = Date.now(),
): Ask | null {
  return asks.find((a) => a.dayKey === dayKey && a.by === me && fresh(a, now)) ?? null;
}

/** An `isAsk` for something that arrived from the other phone. */
export function isAsk(raw: unknown): raw is Ask {
  if (!raw || typeof raw !== 'object') return false;
  const a = raw as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.dayKey === 'string' &&
    PERSON_LIST.some((p) => p.id === a.by) &&
    typeof a.at === 'number' &&
    Boolean(a.answers) &&
    typeof a.answers === 'object'
  );
}

/** Whoever is not me, for the button that names them. */
export function theOther(me: PersonId) {
  return PERSON_LIST.find((p) => p.id !== me) ?? null;
}

/**
 * An answer set with the unanswered questions dropped, which is what goes in
 * the document. A key with `undefined` behind it survives a JSON round trip as
 * nothing at all, so it is taken out here rather than being relied on to
 * vanish quietly.
 */
export function plainAnswers(answers: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}
