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

/** What a pinned place is, which decides its map marker. */
export type PlaceKind = 'eat' | 'do' | 'stay' | 'other';

export const PLACE_KINDS: { id: PlaceKind; label: string; icon: string }[] = [
  { id: 'eat', label: 'Eat', icon: 'ph-fork-knife' },
  { id: 'do', label: 'Do', icon: 'ph-camera' },
  { id: 'stay', label: 'Stay', icon: 'ph-bed' },
  { id: 'other', label: 'Other', icon: 'ph-map-pin' },
];

/**
 * Somewhere pinned near a city — a restaurant, a sight, anything. Plotting one
 * costs nothing; it is only routed once it goes into a day.
 */
export interface Place {
  id: string;
  name: string;
  addr: string;
  note: string;
  kind: PlaceKind;
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
  /** A single metro/bus fare here, per person — prices the day's transit legs. */
  metroFare: number;
  foodPer: number;
  places: Place[];
}

/** How you get to a stop from the one before it. */
export type TravelMode = 'walk' | 'transit' | 'bike';

export interface DayItem {
  id: string;
  time: string;
  title: string;
  note: string;
  cost: number;
  done: boolean;
  /** A pinned place this stop is at — what makes the day routable. */
  placeId: string | null;
  /** Chosen way of getting here from the previous stop. */
  mode: TravelMode;
  /** Minutes you expect to spend here, for the day's time allotment. */
  dwell: number;
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

/** Default minutes at a stop, by what kind of place it is. */
export const DEFAULT_DWELL: Record<PlaceKind, number> = {
  eat: 75,
  do: 90,
  stay: 30,
  other: 45,
};

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
    metroFare: 0,
    foodPer: 0,
    places: [],
  };
}
