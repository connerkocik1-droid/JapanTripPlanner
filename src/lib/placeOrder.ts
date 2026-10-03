/**
 * The order the places under a day are offered in.
 *
 * It is one function on purpose, and this is what it does: put the places most
 * worth adding to *this* day at the top, by what is already known about them
 * and about the day. It is arithmetic and nothing else — no network, no model,
 * no waiting — so the list re-orders as you tap rather than after a think.
 *
 * Four things move a place, and none of them removes it. Nothing disappears
 * from this list: a place you pinned yourself and cannot find again is worse
 * than a place in the wrong order, so everything that was shown is still
 * shown, further down.
 *
 * - How far it is from where the day currently ends. The strongest of the
 *   four, because twenty minutes each way is the difference between a stop and
 *   an outing.
 * - What the day has not got yet. A day with three sights and nowhere to eat
 *   should be offering somewhere to eat.
 * - Whether it is already spoken for — in this day, or on another day of the
 *   trip. Still an idea, just not a new one.
 * - Its rating, which only ever settles a tie.
 *
 * Ties keep the order the traveler put the list in themselves.
 */

import type { Place } from './data.ts';

export interface PlaceOrderCtx {
  /** Seconds from where the day currently ends, per place id, where known. */
  seconds: Record<string, number | undefined>;
  /** The weekday this day falls on, 0 = Sunday. Undefined when not known. */
  weekday?: number;
  /** Place ids already in the day being filled. */
  inDay?: string[];
  /**
   * The kinds those places are, which is where the day's gaps are. Passed in
   * rather than looked up, because the list being ordered may have been
   * narrowed to one kind by the chips above it and would not have the rest.
   */
  inDayKinds?: string[];
  /** Place ids that are in some other day of the trip. */
  elsewhere?: string[];
}

/** Past this, more minutes stop telling you anything: it is simply a trek. */
const FAR_MINS = 60;

export function orderPlaces(places: Place[], ctx: PlaceOrderCtx): Place[] {
  const inDay = new Set(ctx.inDay ?? []);
  const elsewhere = new Set(ctx.elsewhere ?? []);

  /** How much of each kind the day already has, which is where the gaps are. */
  const have: Record<string, number> = {};
  for (const kind of ctx.inDayKinds ?? []) have[kind] = (have[kind] ?? 0) + 1;

  return places
    .map((place, was) => ({ place, was, score: scoreOf(place, ctx, inDay, elsewhere, have) }))
    .sort((a, b) => b.score - a.score || a.was - b.was)
    .map((x) => x.place);
}

function scoreOf(
  place: Place,
  ctx: PlaceOrderCtx,
  inDay: Set<string>,
  elsewhere: Set<string>,
  have: Record<string, number>,
): number {
  let score = 0;

  // Distance, in units of ten minutes. A place nobody has routed yet is not
  // punished for it: an unknown is not the same as a long way away.
  const secs = ctx.seconds[place.id];
  if (typeof secs === 'number' && secs > 0) {
    score -= Math.min(secs / 60, FAR_MINS) / 10;
  }

  // What the day is missing. The second of a kind is worth much less than the
  // first, and the third is worth less than nothing.
  const already = have[place.kind] ?? 0;
  score += already === 0 ? 2.5 : already === 1 ? 0.5 : -1;

  // Already in the plan. In this very day it is all but pointless to offer;
  // on another day it is still worth seeing, just not new.
  if (inDay.has(place.id)) score -= 6;
  else if (elsewhere.has(place.id)) score -= 3;

  // Shut all day. It stays in the list, where the card says so, but there is
  // no sense in it being near the top of a day it cannot be part of.
  if (ctx.weekday !== undefined && (place.shutDays ?? []).includes(ctx.weekday)) score -= 6;

  // A maybe is a weaker idea than a yes, by the traveler's own say-so.
  if (place.vote === 'maybe') score -= 1;

  // The tiebreak, and only that: at most one point between nothing and five
  // stars, which never outweighs any of the above on its own.
  score += Math.max(0, Math.min(5, place.rating || 0)) / 5;

  return score;
}
