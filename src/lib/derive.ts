import { City, DayItem } from './data';
import { TripDoc, dayKey } from './tripState';

export interface DayEntry {
  /** Trip-wide day number, 1-indexed. */
  n: number;
  city: City;
  /** Which night of this city's stay, 0-indexed. */
  nightIndex: number;
  key: string;
  items: DayItem[];
}

export interface CitySpend {
  lodging: number;
  transit: number;
  food: number;
  /** Itinerary item costs for this city's days. */
  activities: number;
  /** Lodging + transit + food — what the budget card sums. */
  total: number;
}

export interface Derived {
  cities: City[];
  schedule: DayEntry[];
  /** City id → its first day number (1-indexed) and night count. */
  span: Record<string, { start: number; nights: number }>;
  spend: Record<string, CitySpend>;
  totals: { lodging: number; transit: number; food: number; activities: number; grand: number };
  checkedCount: number;
  openNotes: number;
  /** True while nothing has been added — the app shows its empty state. */
  empty: boolean;
}

export function selectedHotel(city: City) {
  return city.hotels.find((h) => h.id === city.hotelSel) ?? null;
}

export function derive(doc: TripDoc): Derived {
  const schedule: DayEntry[] = [];
  const span: Record<string, { start: number; nights: number }> = {};

  doc.cities.forEach((city) => {
    span[city.id] = { start: schedule.length + 1, nights: city.nights };
    for (let j = 0; j < city.nights; j++) {
      const key = dayKey(city.id, j);
      schedule.push({ n: schedule.length + 1, city, nightIndex: j, key, items: doc.days[key] ?? [] });
    }
  });

  const spend: Record<string, CitySpend> = {};
  const totals = { lodging: 0, transit: 0, food: 0, activities: 0, grand: 0 };
  const travelers = Math.max(1, doc.trip.travelers || 1);

  doc.cities.forEach((city) => {
    // Only the selected hotel option counts — switching re-costs the trip.
    const hotel = selectedHotel(city);
    const lodging = (Number(hotel?.cost) || 0) * city.nights;
    const transit = (Number(city.transitCost) || 0) * travelers;
    const food = (Number(city.foodPer) || 0) * city.nights;
    const activities = schedule
      .filter((d) => d.city.id === city.id)
      .reduce((a, d) => a + d.items.reduce((b, it) => b + (Number(it.cost) || 0), 0), 0);

    spend[city.id] = { lodging, transit, food, activities, total: lodging + transit + food };
    totals.lodging += lodging;
    totals.transit += transit;
    totals.food += food;
    totals.activities += activities;
  });
  totals.grand = totals.lodging + totals.transit + totals.food;

  return {
    cities: doc.cities,
    schedule,
    span,
    spend,
    totals,
    checkedCount: doc.checklist.filter((c) => c.done).length,
    openNotes: doc.comments.filter((c) => !c.resolved).length,
    empty: doc.cities.length === 0,
  };
}
