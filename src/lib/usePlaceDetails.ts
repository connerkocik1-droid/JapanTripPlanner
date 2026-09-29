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
          if (wantsDetails(place)) todo.push({ cityId: city.id, place });
        });
      });

      for (const item of todo) {
        if (signal.cancelled) return;
        const answer = await lookUp(item.place);
        if (signal.cancelled) return;
        // No key on the server: there is nothing to look up and nothing to
        // report, so the run stops rather than asking about every place in
        // turn. It picks up on its own the first load after a key is added.
        if (answer === 'unconfigured') return;
        const on = new Date().toISOString().slice(0, 10);
        latest.current.fill(item.cityId, item.place.id, detailsPatch(item.place, answer, on));
        // Paced the way the geocoder is. These are somebody else's servers and
        // the work is happening while the travelers look at the map anyway.
        await new Promise((r) => setTimeout(r, 350));
      }
    })();

    return () => {
      signal.cancelled = true;
    };
  }, [arg.ready, waiting]);
}

/** One lookup: the facts, `null` for nothing found, or that there is no key. */
async function lookUp(place: Place): Promise<PlaceFacts | null | 'unconfigured'> {
  const params = new URLSearchParams({ name: place.name.trim() });
  if (place.addr.trim()) params.set('addr', place.addr.trim());
  try {
    const res = await fetch('/api/place-details?' + params.toString());
    if (!res.ok) return null;
    const body = (await res.json()) as { configured?: boolean; result?: PlaceFacts | null };
    if (body.configured === false) return 'unconfigured';
    return body.result ?? null;
  } catch {
    return null;
  }
}
