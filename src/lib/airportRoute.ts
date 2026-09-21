'use client';

import { useEffect, useState } from 'react';
import { Airport } from './airports';
import { Hotel, LatLng } from './data';
import { RouteLeg, betterMode, routeLeg, splitLeg } from './routing';

/** The arrival trip for one hotel option: how long it takes and what it costs. */
export interface AirportRoute {
  hotelId: string;
  /** Door to door, including the walk either side of the ride. */
  seconds: number;
  /** Of that, the part spent on the metro and the part spent on foot. */
  rideSeconds: number;
  walkSeconds: number;
  meters: number;
  /** Fare per person, and what the whole party pays. */
  fare: number;
  cost: number;
  /** Lines you ride, when the router names them. */
  summary: string;
  /** True when nothing rides — walking beat the metro outright. */
  walkOnly: boolean;
  /** True when the ride is a train rather than a city metro. */
  rail: boolean;
  /** True when the numbers are modelled rather than routed by a real service. */
  estimated: boolean;
  provider: string;
}

export interface RouteState {
  loading: boolean;
  route: AirportRoute | null;
}

export interface FareOpts {
  /** Per-person fare for the airport run. */
  fare: number;
  travelers: number;
}

/** Turn a routed leg into the arrival trip, priced for the whole party. */
export function toAirportRoute(hotelId: string, leg: RouteLeg, opts: FareOpts): AirportRoute {
  const { ride, walk } = splitLeg(leg);
  const walkOnly = leg.mode === 'walk' || ride === 0;
  const party = Math.max(1, opts.travelers || 1);
  const fare = walkOnly ? 0 : Math.max(0, Number(opts.fare) || 0);
  return {
    hotelId,
    seconds: leg.seconds,
    rideSeconds: ride,
    walkSeconds: walk,
    meters: leg.meters,
    fare,
    cost: fare * party,
    // An estimate's own summary says only that it is an estimate, which the
    // EST badge already covers; keep the line for the lines you actually ride.
    summary: walkOnly ? 'on foot the whole way' : leg.estimated ? '' : leg.summary ?? '',
    walkOnly,
    rail: !walkOnly && !!leg.rail,
    estimated: leg.estimated,
    provider: leg.provider,
  };
}

/**
 * Route the airport to each hotel option, so the choice between them can be
 * made on the arrival as well as the nightly rate. Walking is offered instead
 * of the metro when the hotel is close enough that riding is not worth it —
 * the same call the day planner makes for a hop.
 */
export async function routeFromAirport(
  airport: Airport,
  hotel: { id: string; ll: LatLng },
  opts: FareOpts,
): Promise<AirportRoute | null> {
  const options = await routeLeg(airport.ll, hotel.ll, ['walk', 'transit']);
  const pick = betterMode(options);
  const leg = (pick && options[pick]) ?? options.transit ?? options.walk;
  return leg ? toAirportRoute(hotel.id, leg, opts) : null;
}

/** Only hotels with coordinates can be routed; the rest need an address first. */
export function routableHotels(hotels: Hotel[]): { id: string; ll: LatLng }[] {
  return hotels.filter((h): h is Hotel & { ll: LatLng } => !!h.ll).map((h) => ({ id: h.id, ll: h.ll }));
}

/**
 * Airport → hotel for every option in a city, keyed by hotel id. Requests are
 * cached per hop by `routeLeg`, so re-rendering or switching cities re-uses
 * what has already been fetched.
 */
export function useAirportRoutes(
  airport: Airport | null,
  hotels: Hotel[],
  opts: FareOpts,
): Record<string, RouteState> {
  const [state, setState] = useState<Record<string, RouteState>>({});
  const targets = routableHotels(hotels);
  const signature = [
    airport?.code ?? '',
    opts.fare,
    opts.travelers,
    ...targets.map((t) => `${t.id}@${t.ll[0].toFixed(5)},${t.ll[1].toFixed(5)}`),
  ].join('|');

  useEffect(() => {
    if (!airport || !targets.length) {
      setState({});
      return;
    }
    let live = true;
    setState(Object.fromEntries(targets.map((t) => [t.id, { loading: true, route: null }])));

    (async () => {
      const results = await Promise.all(
        targets.map(async (t) => [t.id, await routeFromAirport(airport, t, opts)] as const),
      );
      if (!live) return;
      setState(Object.fromEntries(results.map(([id, route]) => [id, { loading: false, route }])));
    })();

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return state;
}
