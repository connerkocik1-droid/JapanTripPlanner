/**
 * Neighbourhoods: the part of a city a place is in.
 *
 * A city's shortlist runs to ninety-odd places, and ninety pins on a phone is
 * a smear rather than a map. Nobody reads it as "here are the places"; they
 * read it as noise. What you actually want to know first is which parts of the
 * city you are going to spend time in — Myeongdong, Hongdae, Asakusa — and
 * what is in each of them. So the map draws a pin per neighbourhood, and the
 * places inside it appear when you open one.
 *
 * Membership is read off the address rather than assigned by hand. Korean and
 * Japanese addresses name their district — "Yongsan-gu", "Shibuya-ku" — which
 * is the same answer a person would give, and it means a place imported from a
 * shortlist lands in the right neighbourhood without anyone sorting it. A
 * place whose address names none of them falls back to the nearest centre, and
 * a place too far from any of them belongs to no neighbourhood and keeps its
 * own pin.
 */

import { City, Hood, LatLng, Place } from './data';
import { kmBetween } from './format';

/**
 * How far from a neighbourhood's centre a place can be and still be counted as
 * in it, when its address does not name one. Seoul's districts run a few
 * kilometres across, so this is generous enough to catch a place on the far
 * side of one and tight enough that the next district over wins instead.
 */
const NEAR_KM = 2.2;

export function blankHood(name = ''): Hood {
  return { id: hoodId(), name, local: '', match: [], ll: null, blurb: '', images: [] };
}

function hoodId(): string {
  return 'h' + Math.random().toString(36).slice(2, 10);
}

/** Does this address name that neighbourhood? */
function named(addr: string, hood: Hood): boolean {
  const a = addr.toLowerCase();
  return hood.match.some((m) => m.trim() && a.includes(m.trim().toLowerCase()));
}

/**
 * Which neighbourhood a place is in, or null. The address wins over distance:
 * a district named in an address is a fact, and a centre is a guess about
 * where the middle of one is.
 */
export function hoodOf(place: Place, hoods: Hood[]): Hood | null {
  const byName = hoods.find((h) => named(place.addr, h));
  if (byName) return byName;
  if (!place.ll) return null;

  let best: Hood | null = null;
  let bestKm = NEAR_KM;
  hoods.forEach((h) => {
    const km = kmBetween(place.ll, h.ll);
    if (km !== null && km < bestKm) {
      best = h;
      bestKm = km;
    }
  });
  return best;
}

export interface HoodGroup {
  hood: Hood;
  /** Every located place in it, whatever it was voted. */
  places: Place[];
  /** The ones said yes to — what the neighbourhood's card lists. */
  yes: Place[];
  /** Where the pin goes: the neighbourhood's own centre, else the middle of it. */
  ll: LatLng;
}

/** Average of some coordinates. Good enough for a pin over a district. */
function middleOf(places: Place[]): LatLng | null {
  const pts = places.map((p) => p.ll).filter((ll): ll is LatLng => !!ll);
  if (!pts.length) return null;
  const lat = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const lng = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return [lat, lng];
}

/**
 * A city's places sorted into its neighbourhoods.
 *
 * `loose` is everything that landed in none of them — those keep their own
 * pins, because a place that quietly disappeared off the map would be worse
 * than a crowded one. A neighbourhood with nothing in it and no centre of its
 * own is left out: there is nowhere to draw it and nothing to say about it.
 */
export function groupByHood(city: City): { groups: HoodGroup[]; loose: Place[] } {
  const hoods = city.hoods ?? [];
  if (!hoods.length) return { groups: [], loose: city.places };

  const bucket = new Map<string, Place[]>();
  const loose: Place[] = [];
  city.places.forEach((p) => {
    const h = hoodOf(p, hoods);
    if (!h) {
      loose.push(p);
      return;
    }
    const list = bucket.get(h.id);
    if (list) list.push(p);
    else bucket.set(h.id, [p]);
  });

  const groups: HoodGroup[] = [];
  hoods.forEach((hood) => {
    const places = (bucket.get(hood.id) ?? []).filter((p) => p.ll);
    const ll = hood.ll ?? middleOf(places);
    if (!ll) return;
    groups.push({
      hood,
      places,
      yes: places.filter((p) => p.vote === 'yes'),
      ll,
    });
  });

  return { groups, loose };
}

/** "6 to do · 4 to eat" — what a neighbourhood has in it, in one line. */
export function hoodLine(group: HoodGroup): string {
  const list = group.yes.length ? group.yes : group.places;
  const eat = list.filter((p) => p.kind === 'eat').length;
  const doing = list.length - eat;
  const parts: string[] = [];
  if (doing) parts.push(`${doing} to do`);
  if (eat) parts.push(`${eat} to eat`);
  if (!parts.length) return 'nothing picked yet';
  return parts.join(' · ') + (group.yes.length ? '' : ', none decided');
}


/**
 * The neighbourhoods that ship with the app, by city name.
 *
 * Like a place pack, and for the same reason: a city whose parts arrive as a
 * file should look, on opening, like a city whose parts were typed in. Missing
 * or malformed means "none", because a map of pins is a worse outcome than a
 * map of pins with no neighbourhoods over it.
 */
export async function loadHoodPack(city: string): Promise<Hood[]> {
  try {
    const res = await fetch('/places/hoods.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const body = (await res.json()) as { cities?: Record<string, unknown> };
    const raw = body.cities?.[city.trim()];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((h) => {
        const v = (h ?? {}) as Partial<Hood>;
        if (typeof v.name !== 'string' || !v.name.trim()) return null;
        const ll =
          Array.isArray(v.ll) && v.ll.length === 2 && v.ll.every((n) => typeof n === 'number')
            ? ([v.ll[0], v.ll[1]] as LatLng)
            : null;
        return {
          ...blankHood(v.name),
          local: typeof v.local === 'string' ? v.local : '',
          match: Array.isArray(v.match) ? v.match.filter((m): m is string => typeof m === 'string') : [],
          ll,
          blurb: typeof v.blurb === 'string' ? v.blurb : '',
          images: Array.isArray(v.images) ? v.images.filter((m): m is string => typeof m === 'string') : [],
        };
      })
      .filter((h): h is Hood => h !== null);
  } catch {
    return [];
  }
}
