// The app ships with no trip content. Everything below is either a type or a
// small convenience default — the cities, hotels, itinerary, checklist and
// budget are all authored by the travelers.

export type LatLng = [number, number];

/** A hotel option. Three blank ones are offered per city; fill in what you find. */
export interface Hotel {
  id: string;
  name: string;
  url: string;
  addr: string;
  cost: number;
  /** Resolved from `addr` by the geocoder. */
  ll: LatLng | null;
}

/** Somewhere to eat, or anything else worth pinning near a city. */
export interface Place {
  id: string;
  name: string;
  addr: string;
  note: string;
  /** Free text: "$", "$$", "reservation", whatever is useful. */
  band: string;
  ll: LatLng | null;
}

export interface City {
  id: string;
  name: string;
  ll: LatLng | null;
  nights: number;
  hotels: Hotel[];
  /** Hotel id, or null while nothing is picked. */
  hotelSel: string | null;
  transitName: string;
  transitUrl: string;
  transitCost: number;
  foodPer: number;
  places: Place[];
}

export interface DayItem {
  id: string;
  time: string;
  title: string;
  note: string;
  cost: number;
  done: boolean;
}

export interface CheckItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Trip {
  name: string;
  /** YYYY-MM-DD; the schedule counts forward from here. */
  start: string;
  travelers: number;
  /** What you plan to spend in total. 0 means no target set. */
  planned: number;
}

export const HOTEL_SLOTS = 3;
export const MAX_NIGHTS = 30;

export function newTrip(): Trip {
  const d = new Date();
  return {
    name: '',
    start: [d.getFullYear(), d.getMonth() + 1, d.getDate()]
      .map((n, i) => (i ? String(n).padStart(2, '0') : String(n)))
      .join('-'),
    travelers: 2,
    planned: 0,
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function blankHotel(): Hotel {
  return { id: uid(), name: '', url: '', addr: '', cost: 0, ll: null };
}

export function blankCity(name: string, ll: LatLng | null = null): City {
  return {
    id: uid(),
    name,
    ll,
    nights: 1,
    hotels: Array.from({ length: HOTEL_SLOTS }, blankHotel),
    hotelSel: null,
    transitName: '',
    transitUrl: '',
    transitCost: 0,
    foodPer: 0,
    places: [],
  };
}
