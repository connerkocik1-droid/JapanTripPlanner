/**
 * What a place is, beyond its name and its pin: a photograph, a rating, what
 * it serves, and when it is worth going.
 *
 * Two of those are facts somebody else published and two are read off them.
 * The split matters, because the app says them in different voices. A rating
 * and a cuisine are reported — they came from a listing and are shown as they
 * were found. A best time to go is *derived*, from the place's own opening
 * hours where they are known and from what it serves where they are not, and
 * is labelled a suggestion wherever it appears. Nothing here invents a score,
 * a photograph or a cuisine for a place that has none: a blank stays blank.
 */

import type { Meal, Place } from './data';

/** Minutes past midnight each meal is usually eaten between. */
const WINDOWS: Record<Meal, [number, number]> = {
  breakfast: [7 * 60, 10 * 60 + 30],
  lunch: [11 * 60 + 30, 14 * 60 + 30],
  dinner: [17 * 60 + 30, 21 * 60],
};

/** How much of a meal's window a place has to be open for to count for it. */
const ENOUGH_MINS = 45;

export const ALL_MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];

/**
 * What the app asked a places directory for, flattened to the fields it keeps.
 * Everything is optional: a directory that knows only a rating is still worth
 * hearing from.
 */
export interface PlaceFacts {
  rating?: number;
  ratingCount?: number;
  cuisine?: string;
  images?: string[];
  url?: string;
  opens?: string;
  closes?: string;
  shutDays?: number[];
}

/**
 * A cuisine short enough to sit on a pin card.
 *
 * Shortlists describe a restaurant the way a person would — "Korean fine
 * dining (3 Michelin stars)", "Wine bar / Western" — which is worth keeping in
 * the notes and far too long for a chip. The parenthetical goes, and a long
 * one keeps only its first alternative. The words themselves are never
 * rewritten: "Korean BBQ" is what the shortlist said and what gets shown.
 */
export function shortCuisine(text: string): string {
  const flat = (text ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (flat.length <= 22) return flat;
  const first = flat.split(/\s*[/|,]\s*/)[0].trim();
  return first || flat;
}

/**
 * Google's place types, as far as a cuisine can honestly be read off them.
 *
 * Only the types that name a food are here. `restaurant`, `food` and
 * `point_of_interest` say nothing about what is served, so they are left out
 * rather than turned into "Restaurant", which would be a label with no
 * information pretending to be one with some.
 */
const TYPE_CUISINE: Record<string, string> = {
  korean_restaurant: 'Korean',
  japanese_restaurant: 'Japanese',
  sushi_restaurant: 'Sushi',
  ramen_restaurant: 'Ramen',
  barbecue_restaurant: 'BBQ',
  chinese_restaurant: 'Chinese',
  thai_restaurant: 'Thai',
  indian_restaurant: 'Indian',
  italian_restaurant: 'Italian',
  french_restaurant: 'French',
  american_restaurant: 'American',
  mexican_restaurant: 'Mexican',
  vietnamese_restaurant: 'Vietnamese',
  spanish_restaurant: 'Spanish',
  greek_restaurant: 'Greek',
  turkish_restaurant: 'Turkish',
  lebanese_restaurant: 'Lebanese',
  brazilian_restaurant: 'Brazilian',
  seafood_restaurant: 'Seafood',
  steak_house: 'Steakhouse',
  pizza_restaurant: 'Pizza',
  hamburger_restaurant: 'Burgers',
  sandwich_shop: 'Sandwiches',
  breakfast_restaurant: 'Breakfast',
  brunch_restaurant: 'Brunch',
  vegetarian_restaurant: 'Vegetarian',
  vegan_restaurant: 'Vegan',
  cafe: 'Cafe',
  coffee_shop: 'Coffee',
  bakery: 'Bakery',
  dessert_shop: 'Dessert',
  ice_cream_shop: 'Ice cream',
  bar: 'Bar',
  wine_bar: 'Wine bar',
  pub: 'Pub',
  bar_and_grill: 'Bar and grill',
};

/**
 * A cuisine from a directory's own classification, or '' when it gave nothing
 * usable. `display` is the directory's own words for the primary type and is
 * preferred — it is already written for a reader.
 */
export function cuisineFromTypes(types: string[], display = ''): string {
  // "Korean barbecue restaurant" is a sentence about a restaurant; the chip
  // wants the two words in front of it.
  const said = shortCuisine(display).replace(/\s+(restaurant|shop|store|place)$/i, '').trim();
  if (said && !/^(restaurant|food|establishment|point of interest)$/i.test(said)) return said;
  for (const t of types ?? []) {
    const hit = TYPE_CUISINE[t];
    if (hit) return hit;
  }
  return '';
}

/** Overlap in minutes between two [start, end) spans. */
function overlap(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
}

function toMins(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((clock ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Which meals the opening hours actually cover.
 *
 * A place shut before eleven is not a breakfast however much you would like it
 * to be. Somewhere that closes after midnight is written with a closing time
 * earlier than its opening one, which is treated as running to the end of the
 * day rather than as a zero-length window.
 */
function mealsFromHours(opens: string, closes: string): Meal[] {
  const from = toMins(opens);
  const to = toMins(closes);
  if (from === null && to === null) return [];
  const start = from ?? 0;
  const end = to === null ? 24 * 60 : to <= start ? 24 * 60 : to;
  return ALL_MEALS.filter((meal) => overlap([start, end], WINDOWS[meal]) >= ENOUGH_MINS);
}

/**
 * What a place is for, when its hours are not known.
 *
 * This is the weaker half of the guess and the reason the answer is always
 * shown as a suggestion. A cafe is a morning, a bar is an evening, and a
 * ramen counter is either — none of that is true of every one of them, but it
 * is a better opening bid than nothing, and a wrong one is one tap to fix.
 */
function mealsFromCuisine(text: string): Meal[] {
  const t = (text ?? '').toLowerCase();
  if (!t.trim()) return [];
  if (/\b(bakery|breakfast|brunch)\b/.test(t)) return ['breakfast', 'lunch'];
  if (/\b(cafe|café|coffee|tea house|dessert|ice cream)\b/.test(t)) return ['breakfast', 'lunch'];
  if (/\b(bar|pub|izakaya|cocktail|makgeolli|wine|brewery|rooftop)\b/.test(t)) return ['dinner'];
  if (/\b(fine dining|omakase|steakhouse|steaks?|bbq|barbecue|hot pot)\b/.test(t)) return ['dinner'];
  if (/\b(ramen|noodle|noodles|street food|dumpling|dim sum|market)\b/.test(t)) return ['lunch', 'dinner'];
  return [];
}

/**
 * When to go, best guess, in the order the day runs. Hours win where there are
 * any; otherwise what it serves has a say; otherwise nothing is claimed.
 */
export function suggestMeals(input: { opens?: string; closes?: string; cuisine?: string; note?: string }): Meal[] {
  const byHours = mealsFromHours(input.opens ?? '', input.closes ?? '');
  if (byHours.length) return byHours;
  return mealsFromCuisine([input.cuisine, input.note].filter(Boolean).join(' '));
}

/** "Lunch or dinner", "Breakfast, lunch or dinner", '' for nothing to say. */
export function mealsLine(meals: Meal[]): string {
  const names = ALL_MEALS.filter((m) => meals?.includes(m));
  if (!names.length) return '';
  const said = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
  return said[0].toUpperCase() + said.slice(1);
}

/** "4.6★ · 302 reviews", or just the score, or '' when there is no rating. */
export function ratingLine(rating: number, count = 0): string {
  if (!(rating > 0)) return '';
  const score = rating.toFixed(1) + '★';
  const reviews = reviewsLine(count);
  return reviews ? `${score} · ${reviews}` : score;
}

/** "302 reviews", or '' when nobody said how many. */
export function reviewsLine(count: number): string {
  if (!(count > 0)) return '';
  return `${count.toLocaleString('en-US')} review${count === 1 ? '' : 's'}`;
}

/**
 * Fold what a lookup found into a place, and say what changed.
 *
 * Everything already on the place wins. The travelers type over these fields —
 * a cuisine they disagree with, a photo they picked themselves, hours they
 * read off the door — and a background pass that overwrote them would undo
 * that work silently on the next load. So a lookup fills blanks and nothing
 * else, and the date stamp is written either way so the place is asked about
 * once rather than on every open.
 */
export function detailsPatch(place: Place, facts: PlaceFacts | null, on: string): Partial<Place> {
  const patch: Partial<Place> = { lookedUp: on };
  const f = facts ?? {};

  if (!(place.rating > 0) && (f.rating ?? 0) > 0) {
    patch.rating = f.rating;
    if ((f.ratingCount ?? 0) > 0) patch.ratingCount = f.ratingCount;
  }
  if (!place.cuisine.trim() && f.cuisine?.trim()) patch.cuisine = f.cuisine.trim();
  if (!place.images.some((s) => s.trim()) && f.images?.length) patch.images = f.images.slice(0, 3);
  if (!place.url.trim() && f.url?.trim()) patch.url = f.url.trim();
  if (!place.opens.trim() && f.opens?.trim()) patch.opens = f.opens.trim();
  if (!place.closes.trim() && f.closes?.trim()) patch.closes = f.closes.trim();
  if (!(place.shutDays ?? []).length && f.shutDays?.length) patch.shutDays = f.shutDays;

  // Worked out last, from the place as it will be once the rest of this patch
  // lands — hours that arrived in this same answer should decide the meals.
  if (place.kind === 'eat' && !(place.meals ?? []).length) {
    const meals = suggestMeals({
      opens: patch.opens ?? place.opens,
      closes: patch.closes ?? place.closes,
      cuisine: patch.cuisine ?? place.cuisine,
      note: place.note,
    });
    if (meals.length) patch.meals = meals;
  }

  return patch;
}

/** As much of a shortlist entry as catching up needs. */
export interface PackEntry {
  name: string;
  rating?: number;
  reviews?: number;
  cuisine?: string;
}

/**
 * What a shortlist knows about a place that is already pinned.
 *
 * The shortlists gained a score, a review count and a cuisine after they had
 * already been imported, so a city pinned last week holds places with none of
 * them. Re-importing the pack is not the answer — it would put back everything
 * anybody had deliberately deleted — so instead the pack is read again and
 * matched by name, and only the blanks are filled. A place that already has a
 * cuisine, or was never in the pack, is left exactly as it is.
 */
export function packCatchUp(entry: PackEntry, place: Place): Partial<Place> {
  const patch: Partial<Place> = {};
  if (!(place.rating > 0) && (entry.rating ?? 0) > 0) {
    patch.rating = entry.rating;
    if ((entry.reviews ?? 0) > 0) patch.ratingCount = entry.reviews;
  }
  if (!place.cuisine.trim() && entry.cuisine?.trim()) patch.cuisine = entry.cuisine.trim();
  if (place.kind === 'eat' && !(place.meals ?? []).length) {
    const meals = suggestMeals({
      opens: place.opens,
      closes: place.closes,
      cuisine: patch.cuisine ?? place.cuisine,
      note: place.note,
    });
    if (meals.length) patch.meals = meals;
  }
  // The score used to be written into the band as "4.5★" because there was
  // nowhere else for it. Where it has just moved to its own field, the band
  // goes back to being what it is for: a price somebody typed.
  if (patch.rating && /^\s*\d(?:\.\d)?★\s*$/.test(place.band)) patch.band = '';
  return patch;
}

/** Matched on name, the way `addPlaces` decides a place is already pinned. */
export function packKey(name: string): string {
  return name.trim().toLowerCase();
}

/** A place the lookup has not seen yet. Only eats and sights are worth asking about. */
export function wantsDetails(place: Place): boolean {
  if (place.kind === 'stay') return false;
  if (!place.name.trim()) return false;
  const stamp = place.lookedUp.trim();
  if (!stamp) return true;
  // The first version stamped a bare date even when the lookup had failed —
  // a key that was not yet live, an API not yet enabled — which left every
  // place it touched blank for good. Those stamps are day-only; stamps written
  // since carry the time. A day-only stamp on a place that never got a
  // photograph is given one more go.
  return /^\d{4}-\d{2}-\d{2}$/.test(stamp) && !place.images.some((s) => s.trim());
}
