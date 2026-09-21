/**
 * What kind of travel a city-to-city leg is.
 *
 * The "getting here" field is free text ("Flight, train or bus"), which is the
 * right thing for a traveler to type — so the kind is read back out of it
 * rather than asked for separately.
 */

const FLIGHT = /\b(flight|flights|flown|fly|flying|flew|plane|airplane|airline|airlines|airways|airfare|jet)\b/i;

/** True when this leg is flown, which is what the map and the panel key off. */
export function isFlightLeg(transitName: string | undefined): boolean {
  return FLIGHT.test(transitName ?? '');
}
