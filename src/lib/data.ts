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
  /** Nightly rate, per the booking listing. The total is this times the nights. */
  cost: number;
  /** A few lines about the place, shown on the map card. */
  overview: string;
  /** Photo URLs, shown as a strip on the map card. Blank lines are ignored. */
  images: string[];
  /** Resolved from `addr` by the geocoder. */
  ll: LatLng | null;
}

/** What a pinned place is, which decides its map marker. */
export type PlaceKind = 'eat' | 'do' | 'stay' | 'other';

/**
 * The colour a kind is drawn in, on the pin and on its card.
 *
 * The travelers picked these: somewhere to eat is red, something to do is
 * green. Those two are the densest thing on a city's map and have to read
 * apart at a glance. Purple stays the app's own accent and stands for lodging,
 * so the kinds nobody has ruled on keep it.
 *
 * Red and green are also two of the leg colours, but a leg is a line and a
 * place is a disc, so the two never have to be told apart from each other.
 */
export const PLACE_KINDS: { id: PlaceKind; label: string; icon: string; color: string }[] = [
  { id: 'eat', label: 'Eat', icon: 'ph-fork-knife', color: '#f2545b' },
  { id: 'do', label: 'Do', icon: 'ph-camera', color: '#37c46f' },
  { id: 'stay', label: 'Stay', icon: 'ph-bed', color: '#9184d9' },
  { id: 'other', label: 'Other', icon: 'ph-map-pin', color: '#9184d9' },
];

export function placeKind(kind: PlaceKind): (typeof PLACE_KINDS)[number] {
  return PLACE_KINDS.find((k) => k.id === kind) ?? PLACE_KINDS[3];
}

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
  /** Free text: "$", "$$", "4.7★", "reservation" — whatever is useful. */
  band: string;
  /** Photo URLs, shown on the map card. Blank lines are ignored. */
  images: string[];
  /** Where to read more — a listing, a menu, a map link. */
  url: string;
  ll: LatLng | null;
}

export function blankPlace(kind: PlaceKind = 'eat'): Place {
  return { id: uid(), name: '', addr: '', note: '', kind, band: '', images: [], url: '', ll: null };
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
  /** Flight legs only: the flight you are on, and when it gets in. */
  flightNo: string;
  /** HH:MM local, as printed on the ticket. */
  arriveAt: string;
  /**
   * IATA code of the airport you arrive at. Blank means "the nearest one",
   * which is what almost every city wants, so nothing has to be set up.
   */
  airportCode: string;
  /** One-way airport→hotel fare per person; 0 uses the airport's typical fare. */
  airportFare: number;
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
  return { id: uid(), name: '', url: '', addr: '', cost: 0, overview: '', images: [], ll: null };
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
    flightNo: '',
    arriveAt: '',
    airportCode: '',
    airportFare: 0,
    metroFare: 0,
    foodPer: 0,
    places: [],
  };
}
