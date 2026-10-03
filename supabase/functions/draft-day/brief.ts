/**
 * What Claude is told about the day it is drafting.
 *
 * The brief is built here, from the trip document the server fetched — never
 * from anything the caller sent. The caller says which day it wants drafted
 * and nothing else, so this endpoint cannot be talked into answering a
 * question of someone else's choosing: the only text that reaches the model is
 * the trip's own.
 *
 * Pure functions over the saved document, so the two things that are easy to
 * get wrong — which places may be proposed, and what counts as already
 * planned — can be tested.
 */

/** Only the fields of the saved plan this endpoint reads. */
export interface DocCity {
  id: string;
  name: string;
  nights: number;
  hotels?: { id: string; name?: string; addr?: string; ll?: [number, number] | null }[];
  hotelSel?: string | null;
  places?: DocPlace[];
}

export interface DocPlace {
  id: string;
  name?: string;
  addr?: string;
  kind?: string;
  cuisine?: string;
  band?: string;
  note?: string;
  rating?: number;
  ratingCount?: number;
  meals?: string[];
  opens?: string;
  closes?: string;
  shutDays?: number[];
  vote?: string;
  ll?: [number, number] | null;
}

export interface Doc {
  trip?: { start?: string; travelers?: number };
  cities?: DocCity[];
  days?: Record<string, { title?: string; placeId?: string | null; time?: string }[]>;
}

/** How many places are worth describing to the model for one day. */
const MAX_PLACES = 80;

export interface DayBrief {
  /** The places that may be proposed, by id. */
  allowed: Set<string>;
  /** The prompt, ready to send. */
  prompt: string;
  /** YYYY-MM-DD, for the reply. */
  date: string;
  cityName: string;
}

/** The day a `cityId:nightIndex` key falls on, counting nights city by city. */
export function dayNumber(cities: DocCity[], cityId: string, night: number): number | null {
  let n = 0;
  for (const city of cities) {
    const nights = Math.max(0, Math.floor(Number(city.nights) || 0));
    if (city.id === cityId) {
      if (night < 0 || night >= nights) return null;
      return n + night + 1;
    }
    n += nights;
  }
  return null;
}

/** YYYY-MM-DD for the nth day of a trip, 1-indexed, with no timezone drift. */
export function dateOfDay(start: string, n: number): string {
  const [y, m, d] = String(start || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d + (n - 1)));
  return dt.toISOString().slice(0, 10);
}

/** `cityId:nightIndex`, the key a day's stops are stored under. */
export function splitKey(key: string): { cityId: string; night: number } | null {
  const i = String(key || '').lastIndexOf(':');
  if (i <= 0) return null;
  const night = Number(key.slice(i + 1));
  if (!Number.isInteger(night) || night < 0) return null;
  return { cityId: key.slice(0, i), night };
}

/**
 * The places a day may be built from: everything pinned to the city except
 * what somebody has voted no on, which is the same rule the map follows.
 */
export function pickable(city: DocCity): DocPlace[] {
  return (city.places ?? [])
    .filter((p) => p && typeof p.id === 'string' && (p.name ?? '').trim() && p.vote !== 'no')
    .slice(0, MAX_PLACES);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function placeLine(p: DocPlace): string {
  const bits: string[] = [`${p.id} — ${(p.name ?? '').trim()}`];
  const kind = p.kind === 'eat' ? 'somewhere to eat' : p.kind === 'do' ? 'something to do' : p.kind;
  if (kind) bits.push(String(kind));
  if (p.cuisine) bits.push(p.cuisine);
  if (p.rating) bits.push(`${p.rating}/5${p.ratingCount ? ` from ${p.ratingCount} reviews` : ''}`);
  if (p.band) bits.push(p.band);
  if (p.meals?.length) bits.push(`good for ${p.meals.join(', ')}`);
  if (p.opens && p.closes) bits.push(`open ${p.opens}–${p.closes}`);
  if (p.shutDays?.length) {
    bits.push(`shut ${p.shutDays.map((d) => WEEKDAYS[d] ?? '?').join(', ')}`);
  }
  if (p.vote === 'maybe') bits.push('voted maybe');
  if (p.addr) bits.push(p.addr);
  if (p.note) bits.push(p.note.replace(/\s+/g, ' ').slice(0, 120));
  return '- ' + bits.join(' · ');
}

/**
 * Everything already on the trip's other days, so a drafted day does not
 * propose the restaurant you are already going to on Thursday.
 */
function alreadyPlanned(doc: Doc, cities: DocCity[], skipKey: string): string[] {
  const lines: string[] = [];
  for (const [key, items] of Object.entries(doc.days ?? {})) {
    if (key === skipKey || !Array.isArray(items) || !items.length) continue;
    const parts = splitKey(key);
    if (!parts) continue;
    const city = cities.find((c) => c.id === parts.cityId);
    const n = dayNumber(cities, parts.cityId, parts.night);
    const names = items.map((it) => (it?.title ?? '').trim()).filter(Boolean);
    if (!names.length) continue;
    lines.push(`- Day ${n ?? '?'} in ${city?.name ?? 'somewhere'}: ${names.join(', ')}`);
  }
  return lines;
}

export const SYSTEM = [
  'You lay out one day of a trip from places the travellers have already saved.',
  'Call the propose_day tool exactly once with three to six stops and nothing else:',
  'no prose before or after it.',
  '',
  'Rules you are held to:',
  '- Every place_id must be copied exactly from the list of saved places you are given.',
  '  Never invent a place, a name or an id. A stop you cannot name an id for is a stop',
  '  you leave out.',
  '- Order the stops so the day moves sensibly between the addresses and coordinates',
  '  given, starting and ending near the hotel rather than crossing the city twice.',
  '- Respect the opening hours and the days a place is shut. The date you are given',
  '  says which weekday it is.',
  '- Put a meal where a meal belongs: breakfast, lunch and dinner at places suited to them.',
  '- Do not propose anything already planned on another day of this trip.',
  '- reason is one short sentence, at most about twenty words, on why this stop at this',
  '  time. Write it to the travellers, plainly, with no preamble.',
].join('\n');

/** Build the brief, or null when the day asked for is not a day of this trip. */
export function briefFor(doc: Doc, key: string): DayBrief | null {
  const cities = (doc.cities ?? []).filter((c) => c && typeof c.id === 'string');
  const parts = splitKey(key);
  if (!parts) return null;
  const city = cities.find((c) => c.id === parts.cityId);
  if (!city) return null;
  const n = dayNumber(cities, parts.cityId, parts.night);
  if (n === null) return null;

  const date = dateOfDay(doc.trip?.start ?? '', n);
  const places = pickable(city);
  const allowed = new Set(places.map((p) => p.id));

  const hotel = (city.hotels ?? []).find((h) => h.id === city.hotelSel) ?? null;
  const weekday = date ? WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] : '';
  const travelers = Math.max(1, Math.floor(Number(doc.trip?.travelers) || 1));
  const planned = alreadyPlanned(doc, cities, key);

  const prompt = [
    `Draft day ${n} of this trip: ${city.name}${date ? `, ${weekday} ${date}` : ''}.`,
    `${travelers} ${travelers === 1 ? 'traveller' : 'travellers'}. Nothing is planned for this day yet.`,
    '',
    hotel
      ? `They are staying at ${hotel.name || 'their hotel'}${hotel.addr ? `, ${hotel.addr}` : ''}${
          hotel.ll ? ` (${hotel.ll[0]}, ${hotel.ll[1]})` : ''
        }. The day should start and end there.`
      : 'No hotel is chosen for this city yet, so start the day wherever the places suit.',
    '',
    `Saved places in ${city.name}, as "id — name":`,
    places.length ? places.map(placeLine).join('\n') : '(none saved yet)',
    '',
    planned.length
      ? ['Already planned on other days — do not propose these again:', ...planned].join('\n')
      : 'Nothing is planned on any other day yet.',
  ].join('\n');

  return { allowed, prompt, date, cityName: city.name };
}

/** The strict schema the model must answer in. */
export const PROPOSE_DAY = {
  name: 'propose_day',
  description:
    'Lay out the day as an ordered list of stops, each at one of the trip’s saved places.',
  strict: true,
  // The input streams as it is written, so a finished stop can reach the phone
  // before the rest of the day exists.
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['place_id', 'start_time', 'duration_min', 'reason'],
          properties: {
            place_id: {
              type: 'string',
              description: 'Copied exactly from the saved places list. Never invented.',
            },
            start_time: { type: 'string', description: 'Local 24-hour clock, HH:MM.' },
            // Bounds are checked in `validateSuggestion` rather than declared
            // here: strict mode is conservative about which JSON Schema
            // keywords it accepts, and an unsupported one fails the request.
            duration_min: {
              type: 'integer',
              description:
                'Minutes to spend here, between 15 and 480, travel to the next stop excluded.',
            },
            reason: {
              type: 'string',
              description: 'One short sentence on why this stop at this time.',
            },
          },
        },
      },
    },
  },
} as const;
