/**
 * What kind of travel a city-to-city leg is.
 *
 * The "getting here" field is free text ("Flight, train or bus"), which is the
 * right thing for a traveler to type — so the kind is read back out of it
 * rather than asked for separately.
 */

const FLIGHT = /\b(flight|flights|flown|fly|flying|flew|plane|airplane|airline|airlines|airways|airfare|jet)\b/i;
const RAIL =
  /(shinkansen|nozomi|hikari|kodama|sakura|mizuho|hayabusa|thunderbird|\btrain\b|\brail\b|\bjr\b|express)/i;

/** True when this leg is flown, which is what the map and the panel key off. */
export function isFlightLeg(transitName: string | undefined): boolean {
  return FLIGHT.test(transitName ?? '');
}

/**
 * How a kind of travel is coloured, wherever it is named.
 *
 * The scheme is the travelers': high-speed rail green, metro yellow, walking
 * red, flights blue. A hop nobody has described yet takes the app's own accent
 * rather than being guessed at as one of the four.
 */
export type LegKind = 'flight' | 'rail' | 'metro' | 'walk' | 'other';

export const LEG_STYLE: Record<LegKind, { color: string; label: string }> = {
  flight: { color: '#2f7fe0', label: 'Flight' },
  rail: { color: '#12874a', label: 'Train' },
  metro: { color: '#d19100', label: 'Metro' },
  walk: { color: '#dc3c30', label: 'Walk' },
  other: { color: '#7a58a8', label: 'Travel' },
};
