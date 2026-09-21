/**
 * What kind of travel a city-to-city leg is.
 *
 * The "getting here" field is free text ("Flight, train or bus"), which is the
 * right thing for a traveler to type — so the kind is read back out of it
 * rather than asked for separately.
 */

import { TravelMode } from './data';

const FLIGHT = /\b(flight|flights|flown|fly|flying|flew|plane|airplane|airline|airlines|airways|airfare|jet)\b/i;
const RAIL =
  /(shinkansen|nozomi|hikari|kodama|sakura|mizuho|hayabusa|thunderbird|\btrain\b|\brail\b|\bjr\b|express)/i;

/** True when this leg is flown, which is what the map and the panel key off. */
export function isFlightLeg(transitName: string | undefined): boolean {
  return FLIGHT.test(transitName ?? '');
}

/**
 * How a leg is drawn, everywhere it is drawn.
 *
 * The scheme is the travelers': high-speed rail green, metro yellow, walking a
 * chopped red, flights a chopped blue. A hop nobody has described yet is drawn
 * in the app's own accent rather than guessed at as one of the four.
 */
export type LegKind = 'flight' | 'rail' | 'metro' | 'walk' | 'other';

export const LEG_STYLE: Record<LegKind, { color: string; dashed: boolean; label: string }> = {
  flight: { color: '#4f9dfd', dashed: true, label: 'Flight' },
  rail: { color: '#1faa5a', dashed: false, label: 'Train' },
  metro: { color: '#eab308', dashed: false, label: 'Metro' },
  walk: { color: '#ef4444', dashed: true, label: 'Walk' },
  other: { color: '#9184d9', dashed: true, label: 'Travel' },
};

/** A routed hop: on foot, on the metro, or on something long and fast enough to be rail. */
export function hopKind(mode: TravelMode, rail?: boolean): LegKind {
  if (mode === 'walk' || mode === 'bike') return 'walk';
  return rail ? 'rail' : 'metro';
}

/** A city-to-city leg, read off the same free text `isFlightLeg` reads. */
export function cityLegKind(transitName: string | undefined): LegKind {
  const t = transitName ?? '';
  if (isFlightLeg(t)) return 'flight';
  return RAIL.test(t) ? 'rail' : 'other';
}
