/**
 * "Help me decide": three picks, from the answers to a handful of chips.
 *
 * Same bargain as drafting a day. The phone sends which day it is asking
 * about and which chips were tapped — ids from `questions.ts`, never prose —
 * and everything Claude reads is assembled here from the saved trip. The one
 * piece of free text anywhere near the prompt is what the travelers typed as
 * their own dietary restrictions, which is their own writing, in their own
 * trip, about themselves.
 */

import { DISTANCE_MINS, type Answers, answerLines } from './questions.ts';
import type { Doc, DocCity, DocPlace } from './brief.ts';
import { dayNumber, dateOfDay, pickable, splitKey } from './brief.ts';

/** Weather as numbers only, so no string from the phone reaches the prompt. */
export interface WeatherHint {
  tempF: number;
  rainPct: number;
  code: number;
}

export interface PickBrief {
  allowed: Set<string>;
  prompt: string;
  cityName: string;
  /** Where the day currently ends — what travel times are measured from. */
  from: { label: string; ll: [number, number] | null };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Enough of the WMO code to say whether to stay indoors. */
function weatherWords(w: WeatherHint): string {
  const c = Math.round(w.code);
  const sky = c === 0 ? 'clear'
    : c <= 3 ? 'cloudy'
    : c <= 48 ? 'foggy'
    : c <= 67 ? 'rainy'
    : c <= 77 ? 'snowy'
    : c <= 82 ? 'showery'
    : 'stormy';
  return `${Math.round(w.tempF)}°F and ${sky}, ${Math.round(w.rainPct)}% chance of rain`;
}

function clock(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Where the day has got to: its last stop, else the hotel, else nothing. */
function endsAt(doc: Doc, city: DocCity, key: string): { label: string; ll: [number, number] | null } {
  const items = doc.days?.[key] ?? [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const place = (city.places ?? []).find((p) => p.id === items[i]?.placeId);
    if (place?.ll) return { label: place.name ?? 'your last stop', ll: place.ll };
  }
  const hotel = (city.hotels ?? []).find((h) => h.id === city.hotelSel) ?? null;
  if (hotel) return { label: hotel.name || 'your hotel', ll: hotel.ll ?? null };
  return { label: city.name, ll: null };
}

function placeLine(p: DocPlace): string {
  const bits: string[] = [`${p.id} — ${(p.name ?? '').trim()}`];
  if (p.kind === 'eat') bits.push('somewhere to eat');
  else if (p.kind === 'do') bits.push('something to do');
  if (p.cuisine) bits.push(p.cuisine);
  if (p.rating) bits.push(`${p.rating}/5`);
  if (p.band) bits.push(p.band);
  if (p.meals?.length) bits.push(`good for ${p.meals.join(', ')}`);
  if (p.opens && p.closes) bits.push(`open ${p.opens}–${p.closes}`);
  if (p.shutDays?.length) bits.push(`shut ${p.shutDays.map((d) => WEEKDAYS[d] ?? '?').join(', ')}`);
  if (p.addr) bits.push(p.addr);
  return '- ' + bits.join(' · ');
}

/** Everything on any day of the trip, so a pick is something new. */
function plannedTitles(doc: Doc): string[] {
  const out = new Set<string>();
  for (const items of Object.values(doc.days ?? {})) {
    for (const it of items ?? []) {
      const t = (it?.title ?? '').trim();
      if (t) out.add(t);
    }
  }
  return [...out];
}

export const PICKS_SYSTEM = [
  'You suggest exactly three things to do next, preferring places the travellers have',
  'already saved. Call the suggest_picks tool exactly once with three picks and nothing',
  'else: no prose before or after it.',
  '',
  'Rules you are held to:',
  '- Every place_id must be copied exactly from the list of saved places you are given.',
  '  Never invent an id.',
  '- Saved places come first. Only when nothing saved answers what they asked for may a',
  '  pick leave place_id null and give new_place_query instead: the name of a real place',
  '  and its city, as somebody would type it into a map. At most one of the three.',
  '  Never both an id and a query on the same pick.',
  '- A pick with new_place_query is a suggestion to go and look something up, so say',
  '  nothing in it you are not sure of. The phone looks the place up itself and shows',
  '  what it finds; what you write is only the name, the reason and your estimates.',
  '- Answer the mood they gave you. The three picks should differ from each other;',
  '  three versions of the same idea is a wasted screen.',
  '- Respect the distance they said they would travel, the time they have, the opening',
  '  hours, and anything they cannot eat. Anything they cannot eat is a hard no.',
  '- Do not suggest something already planned on a day of this trip.',
  '- reason is one short sentence, at most about twenty words, and it must refer to what',
  '  they actually answered — their mood, their budget, how far they will go. Write it to',
  '  them, plainly, with no preamble.',
  '- est_cost_per_person is in US dollars, a whole number, 0 when nothing is charged.',
  '- travel_min is from where they are now, by the way they said they would travel.',
].join('\n');

export interface PickInputs {
  answers: Answers;
  /** Minutes past midnight on the phone, when the trip is under way. */
  nowMins: number | null;
  weather: WeatherHint | null;
  /** Place ids already shown and turned down, which a re-roll excludes. */
  exclude: string[];
}

/** Build the brief, or null when the day asked for is not a day of this trip. */
export function pickBriefFor(doc: Doc, key: string, inputs: PickInputs): PickBrief | null {
  const cities = (doc.cities ?? []).filter((c) => c && typeof c.id === 'string');
  const parts = splitKey(key);
  if (!parts) return null;
  const city = cities.find((c) => c.id === parts.cityId);
  if (!city) return null;
  const n = dayNumber(cities, parts.cityId, parts.night);
  if (n === null) return null;

  const date = dateOfDay(doc.trip?.start ?? '', n);
  const weekday = date ? WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] : '';
  const skip = new Set(inputs.exclude);
  const places = pickable(city).filter((p) => !skip.has(p.id));
  const allowed = new Set(places.map((p) => p.id));
  const from = endsAt(doc, city, key);

  const diets = Object.entries(doc.diets ?? {})
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .map(([who, v]) => `${who} cannot eat: ${v.trim().replace(/\s+/g, ' ').slice(0, 200)}`);

  const reach = inputs.answers.distance ? DISTANCE_MINS[inputs.answers.distance] : null;
  const planned = plannedTitles(doc);

  const prompt = [
    `Day ${n} in ${city.name}${date ? `, ${weekday} ${date}` : ''}.`,
    inputs.nowMins !== null
      ? `It is ${clock(inputs.nowMins)} there now and they are out.`
      : 'They are planning this ahead of the day.',
    `They are starting from ${from.label}${from.ll ? ` (${from.ll[0]}, ${from.ll[1]})` : ''}.`,
    inputs.weather ? `The weather that day: ${weatherWords(inputs.weather)}.` : '',
    '',
    answerLines(inputs.answers).length
      ? ['What they said they want:', ...answerLines(inputs.answers)].join('\n')
      : 'They tapped Surprise me and answered nothing, so read the day and choose for them.',
    reach ? `That puts their limit at roughly ${reach} minutes from where they are.` : '',
    '',
    diets.length ? diets.join('\n') : 'Nobody has recorded anything they cannot eat.',
    '',
    `Saved places in ${city.name}, as "id — name":`,
    places.length ? places.map(placeLine).join('\n') : '(none left to suggest)',
    '',
    planned.length
      ? `Already planned somewhere on this trip, so not these: ${planned.join(', ')}`
      : 'Nothing is planned on any day yet.',
    inputs.exclude.length ? 'They have already turned down other suggestions this round.' : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { allowed, prompt, cityName: city.name, from };
}

/** The strict schema the model must answer in. */
export const SUGGEST_PICKS = {
  name: 'suggest_picks',
  description: 'Offer exactly three things to do next, preferring the trip’s saved places.',
  strict: true,
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['picks'],
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'place_id', 'new_place_query', 'title', 'reason',
            'est_cost_per_person', 'travel_min', 'start_time',
          ],
          properties: {
            place_id: {
              type: ['string', 'null'],
              description: 'A saved place id, copied exactly. Null only when no saved place fits.',
            },
            new_place_query: {
              type: ['string', 'null'],
              description:
                'Null unless place_id is null; then what to search for, as a name and a city.',
            },
            title: { type: 'string', description: 'What to call this on the card.' },
            reason: {
              type: 'string',
              description: 'One short sentence, referring to what they answered.',
            },
            est_cost_per_person: {
              type: 'integer',
              description: 'US dollars per person, whole, 0 when nothing is charged.',
            },
            travel_min: {
              type: 'integer',
              description: 'Minutes to get there from where they are now.',
            },
            start_time: { type: 'string', description: 'Local 24-hour clock, HH:MM.' },
          },
        },
      },
    },
  },
} as const;
