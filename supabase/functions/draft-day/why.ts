/**
 * The one line under the top few places: why this one, for this day.
 *
 * The list itself is ordered by arithmetic — distance, what the day is
 * missing, what it costs — and that arithmetic cannot say *why* in words a
 * person would use. This is the only part of the place list that asks Claude
 * anything, it is asked about at most three places, and the answer is cached
 * on the phone, so a day of scrolling costs one call rather than one a scroll.
 *
 * Same bargain as everywhere else here: the phone sends a day, a few chip ids
 * and up to three place ids of its own trip. Every word the model reads is
 * built here from the saved trip.
 */

import { type Answers, answerLines } from './questions.ts';
import type { Doc, DocPlace } from './brief.ts';
import { dateOfDay, dayNumber, pickable, splitKey } from './brief.ts';

export interface WhyBrief {
  allowed: Set<string>;
  prompt: string;
  cityName: string;
}

/** At most this many, because only the top of a list is ever read closely. */
export const MAX_WHY = 3;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const WHY_SYSTEM = [
  'You write one short line for each place you are given, saying why it suits this',
  'particular evening. Call the say_why tool exactly once, with one line per place you',
  'were given and nothing else: no prose before or after it.',
  '',
  'Rules you are held to:',
  '- Every place_id must be copied exactly from the list you are given. Never invent one.',
  '- One line each, at most about fifteen words, written to the travellers.',
  '- Say something only this place and this day could make true: what they said they',
  '  wanted, what the day already has, the hour, the weather. "A great choice" says',
  '  nothing and is worse than saying nothing.',
  '- Only what you were told. Never state an opening time, a price or a dish that is',
  '  not in front of you.',
  '- No preamble, no name-dropping the place back at them, no exclamation marks.',
].join('\n');

export const SAY_WHY = {
  name: 'say_why',
  description: 'Say in one line why each of these places suits this day.',
  strict: true,
  // Each line can reach the phone as it is written rather than all three at
  // the end, the same way a drafted stop does.
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            place_id: { type: 'string', description: 'Copied exactly from the list given.' },
            why: { type: 'string', description: 'One short line, at most about fifteen words.' },
          },
          required: ['place_id', 'why'],
        },
      },
    },
    required: ['lines'],
  },
} as const;

function placeLine(p: DocPlace): string {
  const bits: string[] = [`${p.id} — ${(p.name ?? '').trim()}`];
  if (p.kind === 'eat') bits.push('somewhere to eat');
  else if (p.kind === 'do') bits.push('something to do');
  if (p.cuisine) bits.push(p.cuisine);
  if (p.rating) bits.push(`${p.rating}/5`);
  if (p.band) bits.push(p.band);
  if (p.opens && p.closes) bits.push(`open ${p.opens}–${p.closes}`);
  if (p.shutDays?.length) bits.push(`shut ${p.shutDays.map((d) => WEEKDAYS[d] ?? '?').join(', ')}`);
  return '- ' + bits.join(' · ');
}

export interface WhyInputs {
  answers: Answers;
  /** The places at the top of the list, in the order they are shown. */
  ids: string[];
}

/** Build the brief, or null when the day or the places are not this trip's. */
export function whyBriefFor(doc: Doc, key: string, inputs: WhyInputs): WhyBrief | null {
  const cities = (doc.cities ?? []).filter((c) => c && typeof c.id === 'string');
  const parts = splitKey(key);
  if (!parts) return null;
  const city = cities.find((c) => c.id === parts.cityId);
  if (!city) return null;
  const n = dayNumber(cities, parts.cityId, parts.night);
  if (n === null) return null;

  const asked = new Set(inputs.ids.slice(0, MAX_WHY));
  const places = pickable(city).filter((p) => asked.has(p.id));
  if (!places.length) return null;

  const date = dateOfDay(doc.trip?.start ?? '', n);
  const weekday = date ? WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] : '';
  const already = (doc.days?.[key] ?? [])
    .map((it) => (it?.title ?? '').trim())
    .filter(Boolean);

  const prompt = [
    `Day ${n} in ${city.name}${date ? `, ${weekday} ${date}` : ''}.`,
    already.length
      ? `The day so far: ${already.join(', ')}.`
      : 'Nothing is planned for this day yet.',
    '',
    answerLines(inputs.answers).length
      ? ['What they said they are in the mood for:', ...answerLines(inputs.answers)].join('\n')
      : 'They have not said what they are in the mood for, so go on the day itself.',
    '',
    'The places, in the order they are being shown:',
    ...places.map(placeLine),
    '',
    `Write one line for each of those ${places.length}.`,
  ]
    .filter(Boolean)
    .join('\n');

  return { allowed: new Set(places.map((p) => p.id)), prompt, cityName: city.name ?? '' };
}
