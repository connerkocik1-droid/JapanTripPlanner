'use client';

import { useEffect, useState } from 'react';
import { Airport, airportByCode, nearestAirport } from './airports';
import { City, Hotel, LatLng, TravelMode } from './data';
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
  /** How you travel it, and the line the map draws for it. */
  mode: TravelMode;
  geometry: [number, number][];
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
    mode: leg.mode,
    geometry: leg.geometry,
  };
}

/**
 * The airport a city arrives at: whatever it has been set to, else the nearest
 * international gateway. Pure, so the map and the city panel can both ask.
 */
export function airportFor(city: City): Airport | null {
  return airportByCode(city.airportCode) ?? nearestAirport(city.ll);
}

/** What one person pays to get in from the airport: the city's figure, else the airport's. */
export function airportFareFor(city: City, airport: Airport | null): number {
  return Number(city.airportFare) || airport?.fare || Number(city.metroFare) || 0;
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

/** A city's arrival: the airport it lands at, and the run to each option. */
export interface CityArrival {
  cityId: string;
  airport: Airport;
}

export interface AirportPlan {
  /** One entry per city that has an airport, for the map's pins. */
  arrivals: CityArrival[];
  /** Airport → hotel for every located option, keyed by hotel id. */
  routes: Record<string, RouteState>;
}

/**
 * Airport → hotel for every option in the cities given. Hotel ids are unique
 * across a trip, so one flat map serves both the city panel, which asks about
 * one city, and the map, which draws several. Requests are cached per hop by
 * `routeLeg`, so the two callers share the same fetches rather than doubling
 * them.
 */
export function useAirportRoutes(cities: City[], travelers: number): AirportPlan {
  const [routes, setRoutes] = useState<Record<string, RouteState>>({});

  const jobs = cities.flatMap((city) => {
    const airport = airportFor(city);
    if (!airport) return [];
    const fare = airportFareFor(city, airport);
    return routableHotels(city.hotels).map((hotel) => ({ cityId: city.id, airport, hotel, fare }));
  });
  const arrivals: CityArrival[] = [];
  cities.forEach((city) => {
    const airport = airportFor(city);
    if (airport) arrivals.push({ cityId: city.id, airport });
  });

  const signature = [
    travelers,
    ...jobs.map((j) => `${j.airport.code}:${j.fare}>${j.hotel.id}@${j.hotel.ll[0].toFixed(5)},${j.hotel.ll[1].toFixed(5)}`),
  ].join('|');

  useEffect(() => {
    if (!jobs.length) {
      setRoutes({});
      return;
    }
    let live = true;
    setRoutes(Object.fromEntries(jobs.map((j) => [j.hotel.id, { loading: true, route: null }])));

    (async () => {
      const results = await Promise.all(
        jobs.map(
          async (j) =>
            [j.hotel.id, await routeFromAirport(j.airport, j.hotel, { fare: j.fare, travelers })] as const,
        ),
      );
      if (!live) return;
      setRoutes(Object.fromEntries(results.map(([id, route]) => [id, { loading: false, route }])));
    })();

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { arrivals, routes };
}
