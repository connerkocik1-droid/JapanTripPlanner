/**
 * Reading a place's facts off OpenStreetMap's tags, for the free lookup.
 *
 * OpenStreetMap knows a great deal about restaurants and sights in Japan —
 * what a place serves, when it opens, its website, and which Wikipedia article
 * is about it — and asks nothing for it. What it does not have is ratings or
 * photographs of its own, so a rating is never made up here, and photographs
 * come from Wikimedia only where OSM says which article or item a place is.
 *
 * Everything here is pure, so it can be tested without the network; the
 * fetching lives in `freeLookup.ts`.
 */

/** OSM's cuisine words that say nothing a reader would want on a card. */
const VAGUE = new Set(['regional', 'local', 'international', 'asian', 'friture']);

/** OSM spellings that read badly with only the underscore taken out. */
const CUISINE_WORDS: Record<string, string> = {
  coffee_shop: 'Coffee',
  bubble_tea: 'Bubble tea',
  barbecue: 'BBQ',
  bbq: 'BBQ',
  korean_bbq: 'Korean BBQ',
  yakiniku: 'Yakiniku',
  ice_cream: 'Ice cream',
  fine_dining: 'Fine dining',
};

/** What an OSM amenity says about a place that has no cuisine tag. */
const AMENITY_WORDS: Record<string, string> = {
  bar: 'Bar',
  pub: 'Pub',
  cafe: 'Cafe',
  biergarten: 'Beer garden',
  ice_cream: 'Ice cream',
};

/**
 * A cuisine from OSM's `cuisine` tag ("ramen;japanese"), falling back on the
 * kind of amenity it is. The first specific value wins, because mappers list
 * the most particular one first as often as not and "Ramen" beats "Japanese".
 */
export function cuisineFromOsm(cuisine: string | undefined, amenity = ''): string {
  const values = (cuisine ?? '')
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v && !VAGUE.has(v));
  const first = values[0];
  if (first) {
    const known = CUISINE_WORDS[first];
    if (known) return known;
    const words = first.replace(/_/g, ' ');
    return words[0].toUpperCase() + words.slice(1);
  }
  return AMENITY_WORDS[amenity.toLowerCase()] ?? '';
}

const DAY_CODES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** "Mo-Fr", "Sa,Su", "Fr-Mo" → weekday numbers, 0 = Sunday. Null if unreadable. */
function daysOf(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = /^([A-Z][a-z])(?:-([A-Z][a-z]))?$/.exec(part.trim());
    if (!m) return null;
    const from = DAY_CODES.indexOf(m[1]);
    const to = m[2] ? DAY_CODES.indexOf(m[2]) : from;
    if (from < 0 || to < 0) return null;
    // A range can wrap the week: "Fr-Mo" is Friday through Monday.
    for (let d = from; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === to) break;
    }
  }
  return [...out];
}

/** "25:30" → "01:30": OSM writes after-midnight closing times past 24. */
function clock(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 48 || min > 59) return null;
  return `${String(h % 24).padStart(2, '0')}:${m[2]}`;
}

function commonest(all: string[]): string {
  const tally = new Map<string, number>();
  all.forEach((v) => tally.set(v, (tally.get(v) ?? 0) + 1));
  let best = '';
  let top = 0;
  tally.forEach((n, v) => {
    if (n > top) {
      top = n;
      best = v;
    }
  });
  return best;
}

/**
 * OSM's `opening_hours` boiled down to the one line the app keeps: the usual
 * opening, the usual closing, and the weekdays it is shut.
 *
 * Only the everyday grammar is read — "Mo-Fr 11:00-14:00,17:00-22:00; Tu off"
 * and the like. Rules for public holidays, months, weeks or sunset are skipped
 * rather than guessed at, because the question the app asks is "is it open on
 * an ordinary Tuesday", and those rules do not answer it. A later rule
 * overrides an earlier one for the days it names, as OSM specifies; a day no
 * rule mentions is shut. Null when nothing could be read.
 */
export function hoursFromOsm(
  spec: string | undefined,
): { opens: string; closes: string; shutDays: number[] } | null {
  const text = (spec ?? '').trim();
  if (!text) return null;
  if (/^24\/7$/.test(text)) return { opens: '', closes: '', shutDays: [] };

  const week: ([string, string][] | null)[] = [null, null, null, null, null, null, null];
  let read = false;

  for (const raw of text.split(';')) {
    const rule = raw.trim();
    if (!rule) continue;
    // A rule opening with anything but a weekday (PH, Jan, week 1, 2026, …)
    // or leaning on the sun is not about an ordinary day.
    if (/\b(PH|SH|easter|sunrise|sunset|dawn|dusk|week|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(rule)) continue;
    const m = /^((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:,(?:[A-Z][a-z](?:-[A-Z][a-z])?))*)?\s*(.*)$/.exec(rule);
    if (!m) continue;
    const days = m[1] ? daysOf(m[1]) : [0, 1, 2, 3, 4, 5, 6];
    if (!days) continue;
    const times = m[2].trim().replace(/"[^"]*"/g, '').trim();

    if (/^(off|closed)$/i.test(times)) {
      days.forEach((d) => (week[d] = []));
      read = true;
      continue;
    }
    const spans: [string, string][] = [];
    for (const span of times.split(',')) {
      const t = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\+?$/.exec(span.trim());
      if (!t) {
        spans.length = 0;
        break;
      }
      const a = clock(t[1]);
      const b = clock(t[2]);
      if (a === null || b === null) {
        spans.length = 0;
        break;
      }
      spans.push([a, b]);
    }
    if (!spans.length) continue;
    days.forEach((d) => (week[d] = spans));
    read = true;
  }

  if (!read) return null;
  const opens: string[] = [];
  const closes: string[] = [];
  const shutDays: number[] = [];
  week.forEach((spans, d) => {
    if (!spans || !spans.length) {
      shutDays.push(d);
      return;
    }
    opens.push(spans[0][0]);
    closes.push(spans[spans.length - 1][1]);
  });
  if (!opens.length) return null;
  return { opens: commonest(opens), closes: commonest(closes), shutDays };
}

/** "ja:浅草寺" → the language and the article title, or null. */
export function wikipediaRef(tag: string | undefined): { lang: string; title: string } | null {
  const m = /^([a-z]{2,3}(?:-[a-z]+)?):(.+)$/i.exec((tag ?? '').trim());
  if (!m) return null;
  return { lang: m[1].toLowerCase(), title: m[2].trim() };
}

/** A Wikimedia Commons file, at a width that suits a card. */
export function commonsFileUrl(file: string, width = 640): string {
  const name = file.replace(/^(File|Image):/i, '').trim();
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`;
}

/**
 * OSM's `image` tag, where it points at Wikimedia. Anything else is a link to
 * somebody's own site, which may not like being shown on ours.
 */
export function imageFromTag(tag: string | undefined): string {
  const v = (tag ?? '').trim();
  if (!v) return '';
  if (/^(File|Image):/i.test(v)) return commonsFileUrl(v);
  if (/^https:\/\/upload\.wikimedia\.org\//.test(v)) return v;
  const commons = /^https?:\/\/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/i.exec(v);
  if (commons) return commonsFileUrl(decodeURIComponent(commons[1]));
  return '';
}

/** Letters and digits only, accents off: "Sensō-ji" and "Senso ji" compare equal. */
export function looseName(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Whether a Wikipedia article found by searching a name is plausibly about
 * that place. A search always returns something; a temple's photograph on the
 * wrong temple is worse than no photograph, so the titles have to agree.
 */
export function sameName(a: string, b: string): boolean {
  const x = looseName(a);
  const y = looseName(b);
  if (x.length < 3 || y.length < 3) return false;
  return x.includes(y) || y.includes(x);
}
