import { LatLng } from './data';
import { kmBetween } from './format';

/**
 * The airports a trip in this part of the world actually arrives at, so the
 * "airport → hotel" route needs no setup: a city that has been geocoded gets
 * its nearest airport on its own.
 *
 * `fare` is the typical one-way, per-person cost of the ordinary rail or metro
 * way into town — Keisei Access Express out of Narita rather than the Narita
 * Express, for instance. They are published fares converted at roughly ¥150,
 * ₩1,300 and NT$32 to the dollar, so they are a starting figure, not a quote;
 * every city can override it.
 */
export interface Airport {
  code: string;
  name: string;
  /** The city it serves, for the picker's labels. */
  serves: string;
  ll: LatLng;
  /** Typical one-way fare into the centre, per person, USD. */
  fare: number;
  /**
   * True for the long-haul gateway you would actually fly into from another
   * continent. Seoul's nearest airport is Gimpo, but an arrival from abroad
   * lands at Incheon — so the default has to prefer the gateway, not the
   * closest strip of tarmac.
   */
  intl: boolean;
}

export const AIRPORTS: Airport[] = [
  { code: 'HND', name: 'Haneda', serves: 'Tokyo', ll: [35.5494, 139.7798], fare: 4, intl: true },
  { code: 'NRT', name: 'Narita', serves: 'Tokyo', ll: [35.7719, 140.3929], fare: 9, intl: true },
  { code: 'KIX', name: 'Kansai', serves: 'Osaka / Kyoto', ll: [34.4347, 135.2328], fare: 7, intl: true },
  { code: 'ITM', name: 'Itami', serves: 'Osaka', ll: [34.7855, 135.4382], fare: 5, intl: false },
  { code: 'UKB', name: 'Kobe', serves: 'Kobe', ll: [34.6328, 135.2238], fare: 6, intl: false },
  { code: 'NGO', name: 'Chubu Centrair', serves: 'Nagoya', ll: [34.8584, 136.8054], fare: 8, intl: true },
  { code: 'CTS', name: 'New Chitose', serves: 'Sapporo', ll: [42.7752, 141.6923], fare: 8, intl: true },
  { code: 'SDJ', name: 'Sendai', serves: 'Sendai', ll: [38.1397, 140.9171], fare: 5, intl: false },
  { code: 'FUK', name: 'Fukuoka', serves: 'Fukuoka', ll: [33.5859, 130.4508], fare: 2, intl: true },
  { code: 'HIJ', name: 'Hiroshima', serves: 'Hiroshima', ll: [34.4361, 132.9194], fare: 10, intl: false },
  { code: 'KMJ', name: 'Kumamoto', serves: 'Kumamoto', ll: [32.8373, 130.8551], fare: 6, intl: false },
  { code: 'KOJ', name: 'Kagoshima', serves: 'Kagoshima', ll: [31.8034, 130.7194], fare: 9, intl: false },
  { code: 'TAK', name: 'Takamatsu', serves: 'Takamatsu', ll: [34.2142, 134.0156], fare: 6, intl: false },
  { code: 'KMQ', name: 'Komatsu', serves: 'Kanazawa', ll: [36.3946, 136.4075], fare: 9, intl: false },
  { code: 'OKA', name: 'Naha', serves: 'Okinawa', ll: [26.1958, 127.6459], fare: 2, intl: true },
  { code: 'ICN', name: 'Incheon', serves: 'Seoul', ll: [37.4602, 126.4407], fare: 4, intl: true },
  { code: 'GMP', name: 'Gimpo', serves: 'Seoul', ll: [37.5583, 126.7906], fare: 2, intl: false },
  { code: 'TPE', name: 'Taoyuan', serves: 'Taipei', ll: [25.0777, 121.2328], fare: 5, intl: true },
  { code: 'TSA', name: 'Songshan', serves: 'Taipei', ll: [25.0697, 121.5525], fare: 1, intl: false },
  { code: 'HKG', name: 'Hong Kong', serves: 'Hong Kong', ll: [22.308, 113.9185], fare: 15, intl: true },
];

/** Beyond this, an airport is not the one you flew into — it is another trip. */
const MAX_KM = 160;

export function airportByCode(code: string | undefined): Airport | null {
  const want = (code ?? '').trim().toUpperCase();
  return AIRPORTS.find((a) => a.code === want) ?? null;
}

/**
 * The airport a city's arrival uses: the nearest international gateway, and
 * only failing that the nearest airport of any kind. Null when the city is
 * nowhere near one. Every city can override it from the picker.
 */
export function nearestAirport(ll: LatLng | null): Airport | null {
  if (!ll) return null;
  const closest = (pool: Airport[]): Airport | null => {
    let best: Airport | null = null;
    let bestKm = Infinity;
    for (const a of pool) {
      const km = kmBetween(ll, a.ll);
      if (km !== null && km < bestKm) {
        bestKm = km;
        best = a;
      }
    }
    return bestKm <= MAX_KM ? best : null;
  };
  return closest(AIRPORTS.filter((a) => a.intl)) ?? closest(AIRPORTS);
}

/** Airports worth offering for a city: near ones first, then the rest. */
export function airportsNear(ll: LatLng | null): Airport[] {
  if (!ll) return AIRPORTS;
  return AIRPORTS.slice().sort((a, b) => {
    const da = kmBetween(ll, a.ll) ?? Infinity;
    const db = kmBetween(ll, b.ll) ?? Infinity;
    return da - db;
  });
}
