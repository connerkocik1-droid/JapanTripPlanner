/**
 * What a place's card can say about it, read out of what is already stored.
 *
 * A place carries a free-text band — "$$", "4.7★", "reservation" — from
 * whatever list it was imported from, as well as a rating and a count from the
 * details lookup. Shown raw they repeat each other and read as noise. So the
 * card asks for each thing separately, and anything that is not known is left
 * out rather than drawn as a placeholder: a dash where a rating should be
 * still reads as a rating.
 */

import type { Place } from './data.ts';

/**
 * How long a walk can be before the metro is the better answer. Twenty minutes
 * is about where a walk stops being the obvious thing to do on a trip.
 */
export const WALK_LIMIT_S = 20 * 60;

export interface ShownLeg {
  kind: 'walk' | 'transit';
  seconds: number;
  /** Metres, for a walk. Zero for a ride, where the distance says nothing. */
  meters: number;
}

/**
 * The one way of getting there a card should offer.
 *
 * Under twenty minutes you walk, whatever the metro would do; past that the
 * metro is the answer and the walk is not worth reading. Offering both made
 * every card a decision it did not need to be. With only one of the two
 * routed, that one is what there is.
 */
export function legToShow(
  opt: { walk?: { seconds: number; meters: number }; transit?: { seconds: number } } | undefined,
): ShownLeg | null {
  if (!opt) return null;
  if (opt.walk && opt.walk.seconds < WALK_LIMIT_S) {
    return { kind: 'walk', seconds: opt.walk.seconds, meters: opt.walk.meters };
  }
  if (opt.transit) return { kind: 'transit', seconds: opt.transit.seconds, meters: 0 };
  if (opt.walk) return { kind: 'walk', seconds: opt.walk.seconds, meters: opt.walk.meters };
  return null;
}

/** "$" through "$$$$" standing on its own anywhere in the band. */
const TIER = /(^|\s)(\$\$?\$?\$?)(\s|$)/;
/** "4.7★", "4.7 stars", "4.7/5" — a rating written into the band. */
const BAND_RATING = /(^|\s)\d(?:\.\d)?\s*(?:★|\/\s*5|stars?)(\s|$)/i;

/** The price tier the band is carrying, or "" when it has none. */
export function priceTier(band: string): string {
  return TIER.exec(band ?? '')?.[2] ?? '';
}

/**
 * The rating as a reader wants it: the score, and how many people it is out
 * of. Null when nobody has one — a score with no reviews behind it is still a
 * score, so only a missing score hides the line.
 */
export function ratingOf(place: Place): { score: string; count: string } | null {
  const score = Number(place.rating) || 0;
  if (score <= 0) return null;
  const n = Number(place.ratingCount) || 0;
  return {
    score: score.toFixed(1),
    count: n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : n ? String(n) : '',
  };
}

/** The first photo worth drawing, or null when the place has none. */
export function photoOf(place: Place): string | null {
  return (place.images ?? []).map((s) => s.trim()).find(Boolean) ?? null;
}

/**
 * Whatever the band says beyond the tier and the rating, which are drawn on
 * their own. "reservation" is worth keeping; "$$ 4.7★" is not worth repeating.
 */
export function bandRest(band: string): string {
  return (band ?? '')
    .replace(TIER, ' ')
    .replace(BAND_RATING, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
