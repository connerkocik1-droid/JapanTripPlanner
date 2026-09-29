'use client';

import { useEffect, useRef } from 'react';
import { City, Place } from './data';
import { PlaceFacts, detailsPatch, wantsDetails } from './placeDetails';

export interface PlaceDetailsArg {
  /** Nothing runs until the trip has actually been read from storage. */
  ready: boolean;
  cities: City[];
  /** Writes the rating, cuisine, hours and photograph in one go. */
  fill: (cityId: string, placeId: string, patch: Partial<Place>) => void;
}

/** A place still waiting to be looked up, and the city it belongs to. */
interface Pending {
  cityId: string;
  city: string;
  place: Place;
}

/**
 * Give every pinned place its photograph, its rating and what it serves,
 * without being asked.
 *
 * Conner pins forty restaurants from a shortlist and expects them to look like
 * restaurants, not like forty names. So this runs the same way the geocoder
 * does: a queue in the background, one at a time, filling in whatever is still
 * blank. A place added by hand joins the same queue on the next pass, which is
 * what makes "all the places I add" true of both routes in.
 *
 * Each place is asked about once. The date stamp is written whether anything
 * came back or not, so a restaurant the directory has never heard of costs one
 * request in its life rather than one per load. Everything the travelers typed
 * wins over everything the directory says — see `detailsPatch`.
 */
export function usePlaceDetails(arg: PlaceDetailsArg): void {
  const latest = useRef(arg);
  latest.current = arg;
  // The queue is rebuilt when the set of places that still want one changes.
  // Using the ids rather than the places themselves keeps a rating landing on
  // one place from restarting the run for the other thirty-nine.
  const waiting = arg.cities
    .flatMap((c) => c.places.filter(wantsDetails).map((p) => p.id))
    .join('|');

  useEffect(() => {
    if (!latest.current.ready || !waiting) return undefined;
    const signal = { cancelled: false };

    void (async () => {
      const todo: Pending[] = [];
      latest.current.cities.forEach((city) => {
        city.places.forEach((place) => {
          if (wantsDetails(place)) todo.push({ cityId: city.id, city: city.name, place });
        });
      });

      for (const item of todo) {
        if (signal.cancelled) return;
        const answer = await lookUp(item.place, item.city);
        if (signal.cancelled) return;
        // No key on the server: there is nothing to look up and nothing to
        // report, so the run stops rather than asking about every place in
        // turn. It picks up on its own the first load after a key is added.
        if (answer === 'unconfigured') return;
        // The lookup itself failed — Google refused the key, or was down. That
        // is not "nothing found", so nothing is stamped and the place is asked
        // about again next load; and since the next one would fail the same
        // way, the run stops here.
        if (answer === 'failed') return;
        const on = new Date().toISOString();
        latest.current.fill(item.cityId, item.place.id, detailsPatch(item.place, answer, on));
        // Paced for the free lookup, which asks OpenStreetMap up to twice a
        // place and is asked for a second between requests. These are
        // somebody else's servers, and the map is being looked at meanwhile.
        await new Promise((r) => setTimeout(r, 2200));
      }
    })();

    return () => {
      signal.cancelled = true;
    };
  }, [arg.ready, waiting]);
}

/** One lookup: the facts, `null` for nothing found, no key, or a failed call. */
async function lookUp(place: Place, city: string): Promise<PlaceFacts | null | 'unconfigured' | 'failed'> {
  const params = new URLSearchParams({ name: place.name.trim(), kind: place.kind, city });
  if (place.addr.trim()) params.set('addr', place.addr.trim());
  // Where it is pinned finds the right branch of a chain.
  if (place.ll) {
    params.set('lat', String(place.ll[0]));
    params.set('lon', String(place.ll[1]));
  }
  try {
    const res = await fetch('/api/place-details?' + params.toString());
    if (!res.ok) return 'failed';
    const body = (await res.json()) as { configured?: boolean; result?: PlaceFacts | null };
    if (body.configured === false) return 'unconfigured';
    return body.result ?? null;
  } catch {
    return 'failed';
  }
}
