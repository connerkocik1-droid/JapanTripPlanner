'use client';

import { useEffect, useRef } from 'react';
import { City, LatLng, Place } from './data';
import { geocodeQueue, hitToLatLng } from './geocode';
import { loadPack, loadPackIndex, packPlaceToPlace, packsFor } from './placePacks';

export interface AutoPacksArg {
  /** Nothing is touched until the trip has actually been read from storage. */
  ready: boolean;
  cities: City[];
  addPlaces: (cityId: string, places: Place[]) => Place[];
  /** Records which shortlists a city has had, so none of them come back. */
  markPacks: (cityId: string, packIds: string[]) => void;
  locate: (cityId: string, placeId: string, ll: LatLng) => void;
}

/** A place still waiting on its address, and the city it belongs to. */
interface Pending {
  cityId: string;
  place: Place;
}

/**
 * Put a city's ready-made shortlists on the map without waiting to be asked.
 *
 * A shortlist behind a button is a shortlist nobody sees: a city whose places
 * arrive as a file should look, on opening, like a city whose places were typed
 * in. So a city that matches a pack gets it once, and the id is written to the
 * city so a place deleted on purpose stays deleted.
 *
 * The same pass then resolves any place that has an address and no pin, whether
 * it came from a pack or was typed in and interrupted. That is what makes this
 * safe to leave running: a reload in the middle of a long queue finishes the
 * job next time rather than stranding half a list with no coordinates.
 */
export function useAutoPacks(arg: AutoPacksArg): void {
  const latest = useRef(arg);
  latest.current = arg;
  // City names decide what is on offer, so a city added later is picked up
  // while adding places to one — which changes nothing here — is not.
  const names = arg.cities.map((c) => c.name).join('|');

  useEffect(() => {
    if (!latest.current.ready) return undefined;
    const signal = { cancelled: false };

    void (async () => {
      const index = await loadPackIndex();
      if (signal.cancelled || !index.length) return;

      // Anything unpinned when this started is owed an address too, so collect
      // it before the packs land and add to it as they do.
      const todo: Pending[] = [];
      latest.current.cities.forEach((city) => {
        city.places.forEach((place) => {
          if (!place.ll && place.addr.trim()) todo.push({ cityId: city.id, place });
        });
      });

      for (const city of latest.current.cities) {
        const want = packsFor(index, city.name).filter((p) => !city.packs.includes(p.id));
        for (const listing of want) {
          if (signal.cancelled) return;
          const pack = await loadPack(listing.file);
          if (!pack) continue;
          const added = latest.current.addPlaces(city.id, pack.places.map(packPlaceToPlace));
          latest.current.markPacks(city.id, [listing.id]);
          added.forEach((place) => todo.push({ cityId: city.id, place }));
        }
      }

      if (signal.cancelled || !todo.length) return;
      await geocodeQueue(
        todo,
        (t) => t.place.addr,
        (t, hit) => {
          if (hit) latest.current.locate(t.cityId, t.place.id, hitToLatLng(hit));
        },
        { signal },
      );
    })();

    return () => {
      signal.cancelled = true;
    };
  }, [arg.ready, names]);
}
