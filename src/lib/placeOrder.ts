/**
 * The order the places under a day are offered in.
 *
 * It is one function on purpose. Ranking a day's candidates — against the
 * budget, what is open when you would get there, what the day is still missing
 * and how far it is from where the day currently ends — is being built in its
 * own right, and when it lands it replaces the body of this function and
 * nothing else. Until then the order is the one the city's list is kept in,
 * which is the order the traveler put it in themselves.
 */

import type { Place } from './data.ts';

export interface PlaceOrderCtx {
  /** Seconds from where the day currently ends, per place id, where known. */
  seconds: Record<string, number | undefined>;
}

export function orderPlaces(places: Place[], _ctx: PlaceOrderCtx): Place[] {
  return places;
}
