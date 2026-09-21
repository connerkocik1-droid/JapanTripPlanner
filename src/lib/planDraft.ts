'use client';

import { DEFAULT_DWELL, LatLng, Place, PlaceKind, TravelMode } from './data';
import { fmtClock } from './dayPlan';
import { LegOptions, betterMode, routeLeg, splitLeg } from './routing';

/**
 * A plan being built on the map: tap a place, see how you would get there from
 * where you are, add it, repeat. Nothing here is persisted — a draft only
 * becomes a day when it is saved.
 */

/** One hop of a plan: how you get there, how long it takes, what it costs. */
export interface PlanLeg {
  mode: TravelMode;
  seconds: number;
  /** The ride and the walk within it — a metro hop is both. */
  rideSeconds: number;
  walkSeconds: number;
  meters: number;
  /** Fare for everyone travelling. Walking is free. */
  cost: number;
  estimated: boolean;
  /** True when the ride is a train rather than a city metro. */
  rail: boolean;
  /** The lines you ride, when the router names them. */
  summary: string;
  /** [lng, lat] pairs, for drawing the hop on the map. */
  geometry: [number, number][];
}

export interface DraftStop {
  placeId: string;
  name: string;
  kind: PlaceKind;
  ll: LatLng;
  /** Minutes you expect to spend here. */
  dwell: number;
  /** How you get here from the stop before it — from the hotel, for the first. */
  leg: PlanLeg;
}

export interface Draft {
  cityId: string;
  /** Minutes past midnight the day starts. */
  startMins: number;
  stops: DraftStop[];
}

export const DEFAULT_START_MINS = 9 * 60;

/**
 * The option worth taking: walking when the distance is reasonable, the metro
 * when it clearly saves time. Both come back from one request, so the choice
 * costs nothing extra.
 */
export function legFrom(options: LegOptions, fare: number, travelers: number): PlanLeg | null {
  const pick = betterMode(options);
  const leg = (pick && options[pick]) ?? options.walk ?? options.transit;
  if (!leg) return null;
  const { ride, walk } = splitLeg(leg);
  const riding = leg.mode !== 'walk' && ride > 0;
  return {
    mode: leg.mode,
    seconds: leg.seconds,
    rideSeconds: riding ? ride : 0,
    walkSeconds: riding ? walk : leg.seconds,
    meters: leg.meters,
    cost: riding ? Math.max(0, Number(fare) || 0) * Math.max(1, travelers) : 0,
    estimated: leg.estimated,
    rail: riding && !!leg.rail,
    summary: riding ? leg.summary ?? '' : 'walk the whole way',
    geometry: leg.geometry,
  };
}

/** Route one hop and price it — what the preview card shows. */
export async function routeHop(
  from: LatLng,
  to: LatLng,
  fare: number,
  travelers: number,
): Promise<PlanLeg | null> {
  return legFrom(await routeLeg(from, to, ['walk', 'transit']), fare, travelers);
}

export function stopFromPlace(place: Place, ll: LatLng, leg: PlanLeg): DraftStop {
  return {
    placeId: place.id,
    name: place.name || 'Stop',
    kind: place.kind,
    ll,
    dwell: DEFAULT_DWELL[place.kind] ?? 60,
    leg,
  };
}

/**
 * Re-route a whole draft from the hotel outward. Dropping a stop changes the
 * hop into the one after it, so the legs are rebuilt rather than patched —
 * requests are cached per hop, so only what actually changed costs anything.
 */
export async function reroute(
  stops: DraftStop[],
  home: LatLng,
  fare: number,
  travelers: number,
): Promise<DraftStop[]> {
  const out: DraftStop[] = [];
  let from = home;
  for (const s of stops) {
    const leg = await routeHop(from, s.ll, fare, travelers);
    out.push(leg ? { ...s, leg } : s);
    from = s.ll;
  }
  return out;
}

export interface PlanRow {
  name: string;
  /** Minutes past midnight. */
  arrive: number;
  depart: number;
  leg: PlanLeg;
}

export interface PlanTimeline {
  rows: PlanRow[];
  /** The way back to where you started, once there is somewhere to come back from. */
  back: { row: PlanRow } | null;
  /** When you are home again, if the return leg is known; else the last departure. */
  endMins: number;
  movingMins: number;
  /** Every fare of the day, the way home included. */
  cost: number;
}

/**
 * Lay a draft out on the clock. The return to the hotel is part of it, not an
 * afterthought: a day that ends an hour from your bed is worth seeing before
 * you commit to it.
 */
export function timeline(draft: Draft, back: PlanLeg | null, home: string): PlanTimeline {
  let clock = draft.startMins;
  let movingMins = 0;
  let cost = 0;
  const rows: PlanRow[] = [];

  draft.stops.forEach((s) => {
    const travel = Math.round(s.leg.seconds / 60);
    clock += travel;
    movingMins += travel;
    cost += s.leg.cost;
    const arrive = clock;
    clock += Math.max(0, s.dwell);
    rows.push({ name: s.name, arrive, depart: clock, leg: s.leg });
  });

  let backRow: PlanRow | null = null;
  if (back && draft.stops.length) {
    const travel = Math.round(back.seconds / 60);
    movingMins += travel;
    cost += back.cost;
    backRow = { name: home, arrive: clock + travel, depart: clock + travel, leg: back };
  }

  return {
    rows,
    back: backRow ? { row: backRow } : null,
    endMins: backRow ? backRow.arrive : clock,
    movingMins,
    cost,
  };
}

/** "09:00" in, minutes past midnight out; anything unparseable keeps the old value. */
export function parseStartTime(value: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return fallback;
  return h * 60 + min;
}

export function startTimeValue(mins: number): string {
  return fmtClock(mins);
}
