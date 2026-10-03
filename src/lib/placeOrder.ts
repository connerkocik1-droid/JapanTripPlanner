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
import { priceTier } from './placeCard.ts';
import { DISTANCE_MINS, type Answers } from '../../supabase/functions/draft-day/questions.ts';

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
  /**
   * The mood the list is being read through — the same answers "Help me
   * decide" asks for. This is the only thing here that takes places out of the
   * list, and it is allowed to because the traveler asked for it in so many
   * words and can take it off again in one tap.
   */
  lens?: Answers;
  /** Minutes past midnight the day currently ends at, for what is open then. */
  endMins?: number | null;
  /**
   * Whether a place is shut when the day would arrive. Handed in rather than
   * worked out here, so opening hours stay the one function in `hours.ts`
   * that reads them and this file stays arithmetic.
   */
  shutAt?: (place: Place, arriveMins: number) => boolean;
  /** What each traveler does not eat, in their own words. */
  diets?: Record<string, string>;
}

export interface Ordered {
  list: Place[];
  /** How many the mood took out, so the list can say so rather than just shrink. */
  hidden: number;
}

/** Past this, more minutes stop telling you anything: it is simply a trek. */
const FAR_MINS = 60;

export function orderPlaces(places: Place[], ctx: PlaceOrderCtx): Ordered {
  const inDay = new Set(ctx.inDay ?? []);
  const elsewhere = new Set(ctx.elsewhere ?? []);

  /** How much of each kind the day already has, which is where the gaps are. */
  const have: Record<string, number> = {};
  for (const kind of ctx.inDayKinds ?? []) have[kind] = (have[kind] ?? 0) + 1;

  const kept = places.filter((p) => fits(p, ctx));

  return {
    list: kept
      .map((place, was) => ({ place, was, score: scoreOf(place, ctx, inDay, elsewhere, have) }))
      .sort((a, b) => b.score - a.score || a.was - b.was)
      .map((x) => x.place),
    hidden: places.length - kept.length,
  };
}

/** The shortest a word has to be before matching it means anything. */
const DIET_WORD = 4;

/**
 * Whether the mood lets this place through.
 *
 * Three things rule a place out, and all three are things the traveler said
 * out loud: how far they will go, that they want somewhere open when they
 * would get there, and what they do not eat. Everything else about the lens
 * only moves a place up or down. With no lens, nothing is ruled out.
 */
export function fits(place: Place, ctx: PlaceOrderCtx): boolean {
  const lens = ctx.lens ?? {};

  const mins = travelMins(place, ctx);
  const reach = lens.distance ? DISTANCE_MINS[lens.distance] : undefined;
  // An unrouted place is not ruled out for a distance nobody has measured.
  if (reach !== undefined && mins !== null && mins > reach) return false;

  // Only once there is a mood at all: without one this is the plain list, and
  // the card already says what is shut.
  if (Object.keys(lens).length && ctx.shutAt) {
    const arrive = arriveAt(ctx, mins);
    if (arrive !== null && ctx.shutAt(place, arrive)) return false;
  }

  if (Object.keys(lens).length && place.kind === 'eat' && avoids(place, ctx.diets)) return false;

  return true;
}

function travelMins(place: Place, ctx: PlaceOrderCtx): number | null {
  const secs = ctx.seconds[place.id];
  return typeof secs === 'number' && secs >= 0 ? Math.round(secs / 60) : null;
}

/** When the day would get there: where it ends now, plus the journey. */
function arriveAt(ctx: PlaceOrderCtx, mins: number | null): number | null {
  if (ctx.endMins === null || ctx.endMins === undefined) return null;
  return ctx.endMins + (mins ?? 0);
}

/**
 * Whether anybody has said they do not eat this.
 *
 * It is a word match against what the place serves and what it is called,
 * which is all there is to go on — a diet is written in the traveler's own
 * words, not picked off a list. Short words are ignored, because "nut" inside
 * "doughnut" would take out half of Tokyo.
 */
function avoids(place: Place, diets: Record<string, string> | undefined): boolean {
  if (!diets) return false;
  const says = `${place.cuisine} ${place.name}`.toLowerCase();
  for (const text of Object.values(diets)) {
    for (const raw of (text ?? '').toLowerCase().split(/[^a-z]+/)) {
      if (raw.length >= DIET_WORD && says.includes(raw)) return true;
    }
  }
  return false;
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

  // What they are after. Not a filter — the chips above the list already do
  // that, and somewhere to eat is still worth seeing on a night out.
  const after = ctx.lens?.after;
  if (after === 'eat' || after === 'drink') score += place.kind === 'eat' ? 1.5 : -0.5;
  else if (after === 'do' || after === 'wander') score += place.kind === 'do' ? 1.5 : -0.5;

  // What it costs against what they said they felt like spending. Only the
  // places carrying a price band have anything to say here.
  score += budgetFit(ctx.lens?.budget, priceTier(place.band));

  // A maybe is a weaker idea than a yes, by the traveler's own say-so.
  if (place.vote === 'maybe') score -= 1;

  // The tiebreak, and only that: at most one point between nothing and five
  // stars, which never outweighs any of the above on its own.
  score += Math.max(0, Math.min(5, place.rating || 0)) / 5;

  return score;
}

/** How well a price band answers what they felt like spending. */
function budgetFit(budget: string | undefined, tier: string): number {
  if (!budget || !tier) return 0;
  const dollars = tier.length;
  if (budget === 'cheap') return dollars <= 1 ? 1.5 : dollars === 2 ? 0.5 : -1.5;
  if (budget === 'splurge') return dollars >= 3 ? 1.5 : dollars === 2 ? 0.5 : -0.5;
  // Normal: the middle two, and nothing much against either end.
  return dollars === 2 || dollars === 3 ? 1 : 0;
}
