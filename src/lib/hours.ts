/**
 * When a place is open, and whether the day you have planned actually works.
 *
 * The plan already knows what time you get to each stop and what time you
 * leave it, so the app can say "you arrive at 18:40 and it shuts at 17:00"
 * rather than leaving you to notice on the doorstep. Museums and gardens in
 * Japan and Korea close one fixed weekday, which is the other half of this:
 * a Monday plan full of Monday closures reads fine until you are standing
 * outside one.
 *
 * Hours are optional on every place. Nothing here guesses: a place with
 * nothing filled in raises nothing.
 */

import { Place } from './data';
import { parseClock } from './dayPlan';

/** Sunday first, matching `Date.getDay()`. */
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Plural, for "Closed on Mondays". */
export const WEEKDAYS_LONG = [
  'Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays',
];

export type ClashKind = 'shut' | 'early' | 'late' | 'overrun';

export interface Clash {
  kind: ClashKind;
  /** One line, for under the stop. */
  text: string;
  /** 'hard' is shut when you get there; 'soft' still gets you in. */
  weight: 'hard' | 'soft';
}

const clock = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${ampm}` : `${h12}${ampm}`;
};

/** True when this place is shut for the whole of that weekday. */
export function shutOn(place: Place, weekday: number): boolean {
  return (place.shutDays ?? []).includes(weekday);
}

/**
 * What is wrong with visiting this place at this time on this day, if
 * anything. `arrive` and `depart` are minutes past midnight, as the day plan
 * counts them; pass nulls for a place not yet in a day and only the weekday is
 * checked.
 */
export function clashFor(
  place: Place | null,
  weekday: number,
  arrive: number | null,
  depart: number | null,
): Clash | null {
  if (!place) return null;

  if (shutOn(place, weekday)) {
    return { kind: 'shut', weight: 'hard', text: `Closed on ${WEEKDAYS_LONG[weekday]}` };
  }

  const opens = parseClock(place.opens ?? '');
  const closes = parseClock(place.closes ?? '');
  if (arrive === null) return null;

  // Past midnight the day plan keeps counting up; a stop at 25:10 is 1:10am,
  // and comparing that against a 17:00 closing time would be nonsense.
  const at = arrive % (24 * 60);

  // Somewhere open 17:00–02:00 closes the next morning. Closed is then the
  // stretch between the closing and the opening, and whichever of the two the
  // arrival is nearer to is the one worth saying.
  if (opens !== null && closes !== null && closes <= opens) {
    if (at >= closes && at < opens) {
      return at - closes < opens - at
        ? { kind: 'late', weight: 'hard', text: `Shuts at ${clock(closes)} — you get there ${clock(at)}` }
        : { kind: 'early', weight: 'hard', text: `Opens at ${clock(opens)} — you get there ${clock(at)}` };
    }
    const out = depart === null ? null : depart % (24 * 60);
    if (out !== null && out > closes && out < opens) {
      return { kind: 'overrun', weight: 'soft', text: `Shuts at ${clock(closes)}, part-way through your stay` };
    }
    return null;
  }

  if (closes !== null && at >= closes) {
    return { kind: 'late', weight: 'hard', text: `Shuts at ${clock(closes)} — you get there ${clock(at)}` };
  }
  if (opens !== null && at < opens) {
    return { kind: 'early', weight: 'hard', text: `Opens at ${clock(opens)} — you get there ${clock(at)}` };
  }
  if (closes !== null && depart !== null && depart % (24 * 60) > closes) {
    return {
      kind: 'overrun',
      weight: 'soft',
      text: `Shuts at ${clock(closes)}, part-way through your stay`,
    };
  }
  return null;
}

/** "9am – 5pm, closed Mondays" — the place's hours in one line, or ''. */
export function hoursLine(place: Place): string {
  const opens = parseClock(place.opens ?? '');
  const closes = parseClock(place.closes ?? '');
  const parts: string[] = [];
  if (opens !== null && closes !== null) parts.push(`${clock(opens)} – ${clock(closes)}`);
  else if (opens !== null) parts.push(`from ${clock(opens)}`);
  else if (closes !== null) parts.push(`until ${clock(closes)}`);

  const shut = (place.shutDays ?? []).slice().sort();
  if (shut.length) parts.push('closed ' + shut.map((d) => WEEKDAYS_LONG[d]).join(', '));
  return parts.join(', ');
}
