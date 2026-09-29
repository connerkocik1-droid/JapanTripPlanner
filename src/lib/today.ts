/**
 * Where the day has got to, right now.
 *
 * Everything else in the app is planning: you sit down, lay a day out, and
 * read it top to bottom. On the trip you are standing on a platform with one
 * hand free and you want one thing — what now, and when do I have to move.
 * That is what this works out, from the same plan the Days tab draws.
 */

import { DayPlan, PlannedStop } from './dayPlan';
import { parseStart } from './format';

/** Minutes past midnight, from a clock rather than from the plan. */
export function nowMins(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Which day of the trip today is, 1-indexed, or null when today falls outside
 * it. `nights` is how many days the trip runs for.
 */
export function tripDayOn(start: string, days: number, now: Date = new Date()): number | null {
  if (!start || days < 1) return null;
  const s = parseStart(start);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const n = Math.round((today.getTime() - s.getTime()) / 86400000) + 1;
  return n >= 1 && n <= days ? n : null;
}

/** How many whole days until the trip starts; negative once it has begun. */
export function daysToStart(start: string, now: Date = new Date()): number {
  if (!start) return 0;
  const s = parseStart(start);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((s.getTime() - today.getTime()) / 86400000);
}

export type StopState = 'done' | 'here' | 'coming';

export interface Progress {
  /** Each planned stop, in order, with where you are among them. */
  states: StopState[];
  /** The stop you should be standing in, if any. */
  here: PlannedStop | null;
  hereIndex: number;
  /** The next one you have not reached, if any. */
  next: PlannedStop | null;
  nextIndex: number;
  /**
   * When to leave for `next` — its arrival less the travel to it. Null when
   * nothing is next, or when that hop was never routed.
   */
  leaveAt: number | null;
  /** The day has not started yet; `next` is its first stop. */
  early: boolean;
  /** Every stop is behind you. */
  done: boolean;
  /** The clock this was read against, in the plan's own minutes. */
  at: number;
}

/**
 * A day that runs past midnight keeps counting up — 00:30 is minute 1470, not
 * minute 30 — so a clock read after midnight is moved onto the same scale
 * before anything is compared. Only a day that actually runs that late does
 * this: otherwise 00:30 is tomorrow morning, and the day is simply over.
 */
function onPlanClock(plan: DayPlan, now: number): number {
  const last = plan.stops.length ? plan.stops[plan.stops.length - 1].depart : plan.startMins;
  return last > 24 * 60 && now < plan.startMins ? now + 24 * 60 : now;
}

/** Read a planned day against the clock. */
export function progressOf(plan: DayPlan | null, now: number): Progress | null {
  if (!plan) return null;
  const at = onPlanClock(plan, now);

  const states: StopState[] = plan.stops.map((s) =>
    at >= s.depart ? 'done' : at >= s.arrive ? 'here' : 'coming',
  );
  const hereIndex = states.indexOf('here');
  const nextIndex = states.indexOf('coming');
  const next = nextIndex >= 0 ? plan.stops[nextIndex] : null;

  return {
    states,
    here: hereIndex >= 0 ? plan.stops[hereIndex] : null,
    hereIndex,
    next,
    nextIndex,
    leaveAt: next && next.travelMins !== null ? next.arrive - next.travelMins : null,
    early: plan.stops.length > 0 && nextIndex === 0 && hereIndex < 0,
    done: plan.stops.length > 0 && states.every((s) => s === 'done'),
    at,
  };
}

/** "in 25 min" / "in 1h 10m" / "now" — a wait, said the way you would say it. */
export function inSpan(mins: number): string {
  const m = Math.round(mins);
  if (m <= 0) return 'now';
  if (m < 60) return `in ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `in ${h}h ${rest}m` : `in ${h}h`;
}
