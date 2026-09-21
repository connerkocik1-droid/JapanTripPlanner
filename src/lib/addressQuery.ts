/**
 * Turning a typed address into something a gazetteer will actually match.
 *
 * Korean addresses in particular carry a floor and a building ("2F Hilltop
 * Bldg, 19 Dosan-daero 67-gil") that Nominatim has never heard of, and plenty
 * of them are lot numbers rather than roads. So a query is tried in widening
 * steps, and each step says how exact a hit from it would be: a pin the
 * traveler should check before counting on it is worth marking as one, rather
 * than quietly dropping a restaurant into the middle of its district.
 *
 * Kept out of the route handler because a Next.js route may only export the
 * handful of names Next knows about — and because it is the part worth
 * exercising on its own.
 */

/** How exact the match is: the address as given, its road, or its district. */
export type GeocodePrecision = 'exact' | 'road' | 'area';

/** A floor on its own: "B1", "2F", "1F-2F", "Lobby Fl.". */
const FLOOR = /^(b\d+|\d+f(-\d+f)?|lobby(\s+fl\.?)?|basement|ground)\b/i;
/** A named building rather than a street. */
const BUILDING = /\b(bldg|building|tower|centre|center|plaza|hall)\b\.?/i;
/** A house number on a Korean road, or a western street address. */
const STREET = /^\d+(-\d+)?\s+\S+/;

/**
 * Floors and building names: real to a traveler standing outside, invisible to
 * a gazetteer. "2F Conrad Seoul" is noise; "23-1 Yeouido-dong" is the address.
 */
function isNoise(part: string): boolean {
  const p = part.trim();
  if (!p) return true;
  if (STREET.test(p) && !FLOOR.test(p)) return false;
  return FLOOR.test(p) || BUILDING.test(p);
}

/**
 * The queries to try, widest last. Each step drops something the gazetteer is
 * least likely to know: first the parenthetical glosses, then the floor and
 * building, then the house number, then everything but the district.
 */
export function queryLadder(raw: string): { q: string; precision: GeocodePrecision }[] {
  const base = raw.replace(/\s+/g, ' ').trim();
  const plain = base.replace(/\s*\([^)]*\)/g, '').trim();
  const parts = plain.split(',').map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p) => !isNoise(p));

  const steps: { q: string; precision: GeocodePrecision }[] = [
    { q: base, precision: 'exact' },
    { q: plain, precision: 'exact' },
    { q: kept.join(', '), precision: 'exact' },
  ];

  // Same address without the house number: lands on the road, not the door.
  if (kept.length) {
    const road = kept.slice();
    road[0] = road[0].replace(/^\d+(-\d+)?\s+/, '').trim();
    if (road[0] && road.join(', ') !== kept.join(', ')) {
      steps.push({ q: road.join(', '), precision: 'road' });
    }
  }
  // The district, without the road — the last resort, and never better than
  // "somewhere around here". Dropping to the city alone is not worth doing: a
  // pin on Seoul city hall says less than no pin at all.
  if (kept.length > 2) steps.push({ q: kept.slice(1).join(', '), precision: 'area' });

  const seen = new Set<string>();
  return steps.filter((s) => {
    const k = s.q.toLowerCase();
    if (!s.q || s.q.length < 4 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

