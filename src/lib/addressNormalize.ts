/**
 * Bending a Korean or Japanese address into a shape a gazetteer will match.
 *
 * The addresses on this trip arrive from listings, review sites and hotel
 * confirmations, and every one of them writes an address differently. A Seoul
 * restaurant might be "2F Hilltop Bldg, 19 Dosan-daero 67-gil, Gangnam-gu,
 * Seoul", or the older lot form "Donggyo-dong 150-2, Mapo-gu, Seoul", or carry
 * a five-digit postcode welded to the city. A Tokyo one might be
 * "1-2-3 Jingumae, Shibuya-ku, Tokyo", the same thing in Japanese, or the
 * chome spelled out. Nominatim knows all of those places; it just does not
 * recognise most of those spellings, so it answers with the ward and the pin
 * lands half a mile from dinner.
 *
 * So before anything is searched, the address is taken apart here: floors and
 * building names set aside, postcodes lifted out, lot numbers put in front of
 * the neighbourhood where a gazetteer expects them, macrons flattened, the
 * country named. The original text is never edited — it stays the address on
 * the card, because it is what the traveler will read out to a taxi driver.
 * What comes out of this file is only a list of ways to ask.
 *
 * The one rule underneath all of it: an address is never quietly turned into a
 * different place. Where the address itself admits it is not a point — "no
 * single street address", "exact street number unconfirmed" — that is carried
 * through as a cap on how exact any answer may claim to be, so a mountain
 * stays marked approximate however confidently the gazetteer replies.
 */

/** How exact a match is: the address as given, its block, its road, or its district. */
export type GeocodePrecision = 'exact' | 'road' | 'block' | 'area';

/** Which country's conventions the address appears to follow. */
export type AddressLocale = 'kr' | 'jp' | 'other';

/** One way of asking, and how exact an answer from it could honestly be. */
export interface AddressQuery {
  q: string;
  precision: GeocodePrecision;
}

/** What the address turned out to be made of, once taken apart. */
export interface NormalizedAddress {
  /** The address as given, whitespace tidied and nothing else. */
  original: string;
  locale: AddressLocale;
  /** The best single query — the first rung of the ladder. */
  query: string;
  /** Floors, building names and prose set aside as invisible to a gazetteer. */
  dropped: string[];
  /** A postcode found in the address, lifted out of the widened queries. */
  postcode?: string;
  /**
   * The most exact any answer may claim to be. Usually 'exact'; capped lower
   * when the address says of itself that it is an area rather than a door.
   */
  ceiling: GeocodePrecision;
}

const PRECISION_ORDER: GeocodePrecision[] = ['exact', 'block', 'road', 'area'];

/** The vaguer of two precisions, so a cap can be applied without ceremony. */
export function coarser(a: GeocodePrecision, b: GeocodePrecision): GeocodePrecision {
  return PRECISION_ORDER.indexOf(a) > PRECISION_ORDER.indexOf(b) ? a : b;
}

/* ------------------------------------------------------------------ script */

const HANGUL = /[가-힣ᄀ-ᇿ]/;
const KANA = /[぀-ヿ]/;
const HAN = /[一-鿿]/;
/** Japanese administrative suffixes, which settle a Han-only string. */
const JP_HAN_MARKERS = /[都道府県市区町村]|丁目|番地|[０-９0-9]番/;

/** Romanised tells. `-gu` is Korean, `-ku` Japanese; both can look alike at a glance. */
const KR_WORDS =
  /(^|[\s,(-])(seoul|busan|incheon|daegu|daejeon|gwangju|ulsan|sejong|suwon|jeju|gyeonggi|gangwon|jeonju|gyeongju|korea)\b|-(gu|ro|gil|daero|dong|eup|myeon|ri|ga|si|do)\b/i;
const JP_WORDS =
  /(^|[\s,(-])(tokyo|osaka|kyoto|nagoya|yokohama|sapporo|fukuoka|kobe|hiroshima|sendai|nara|hakone|kanazawa|okinawa|japan|prefecture)\b|\b(chome|chuo|banchi)\b|-(ku|shi|cho|machi|gun|ken|to|fu)\b/i;

/** Which country's conventions this address follows, as best as it can be told. */
export function detectLocale(raw: string): AddressLocale {
  const s = raw.normalize('NFKC');
  if (HANGUL.test(s)) return 'kr';
  if (KANA.test(s)) return 'jp';
  if (HAN.test(s) && JP_HAN_MARKERS.test(s)) return 'jp';

  // Romanised: count the tells rather than trusting the first one, because
  // "Ginza, Chuo-ku, Tokyo" and "Insadong, Jongno-gu, Seoul" both carry words
  // that look like the other country's if read one at a time.
  const kr = countMatches(s, KR_WORDS);
  const jp = countMatches(s, JP_WORDS);
  if (kr > jp) return 'kr';
  if (jp > kr) return 'jp';
  return 'other';
}

function countMatches(s: string, pattern: RegExp): number {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  return (s.match(re) ?? []).length;
}

const COUNTRY: Record<AddressLocale, string | null> = {
  kr: 'South Korea',
  jp: 'Japan',
  other: null,
};

/** A country already named, in any of the spellings these addresses arrive with. */
const COUNTRY_NAMED: Record<AddressLocale, RegExp> = {
  kr: /\b(south korea|republic of korea|korea, south|korea)\b|대한민국|한국/i,
  jp: /\bjapan\b|日本/i,
  other: /$^/,
};

/* ------------------------------------------------------------------- pieces */

/** A floor, a basement, a suite — real to someone standing outside, invisible to a gazetteer. */
const FLOOR =
  /^(b\d+f?|\d+f(\s*-\s*\d+f)?|\d+(st|nd|rd|th)\s+floor|floor\s+\d+|lobby(\s+fl\.?|\s+floor)?|basement|ground(\s+floor)?|rooftop|#\s*\d+[a-z]?|(suite|ste|unit|rm|room|no)\.?\s*\d+|지하\s*\d*층?|\d+\s*층|地下\d*階?|\d+\s*階)(?![a-z0-9])/i;

/** A named building rather than a street. */
const BUILDING = /\b(bldg|building|tower|centre|center|plaza|hall|mall|complex|annex|arcade|b\/d)\b\.?/i;

/** Prose bolted onto the front of an address: "Trail entrance: 29 …". */
const LEAD_IN = /^(trail\s+entrance|entrance|main\s+entrance|meet\s+at|address|located\s+at|inside|within|near)\b\s*[:\-]?\s*/i;

/** The address confessing it is not a point. Whatever matches, the pin is approximate. */
const NOT_A_POINT =
  /\b(no single street address|exact street number unconfirmed|street number unconfirmed|spans several|several districts|area|vicinity|district|alleys off|around)\b/i;

/** A Korean postcode (five digits) or a Japanese one (three, a hyphen, four). */
const POSTCODE = /(?:〒\s*)?\b(\d{3}-\d{4}|\d{5})\b/;

/** Korean road classes, in the order a road name ends with them. */
const KR_ROAD = /(?:^|[\s(])([\p{L}\d ]*?)\s*-?(daero|ro|gil)\b/iu;
/** A bare house number: "19", "8-1", "137-11". */
const HOUSE_NUMBER = /^\d+(-\d+)?$/;
/** A Korean neighbourhood: Yeouido-dong, Myeongdong 2-ga. */
const KR_NEIGHBOURHOOD = /\b[\p{L}]+(-dong|dong|\d+-ga)\b/iu;

/**
 * The same things written in Hangul, which is what you get copying an address
 * out of Naver or Kakao — 서빙고로 is a road, 용산구 a district, and neither
 * contains a single Latin letter for the patterns above to match on.
 */
const KR_ROAD_NATIVE = /[\uac00-\ud7a3]+(?:대로|로|길)/;
const KR_ADMIN_NATIVE = /[\uac00-\ud7a3]+(?:특별시|광역시|자치시|자치도|시|군|구|동|읍|면|리|가)/;
/** A Korean house number at the end of a native address: 서빙고로 137, 도산대로67길 19. */
const KR_NUMBER_NATIVE = /(?:대로|로|길)\s*\d+(?:-\d+)?\s*(?:번지)?\s*$/;

/** A Japanese address in kanji: 神宮前1丁目2番3号, 歌舞伎町1-2-3. */
const JP_CHOME_NATIVE = /\d+\s*丁目/;
/** The banchi and go that name a building rather than a block. */
const JP_NUMBER_NATIVE = /\d+\s*(?:番地|番|号)/;
/** A Japanese street address in romaji: "1-2-3 Jingumae", "2-chome-3-1 Kabukicho". */
const JP_BANCHI = /^(\d+)(?:-chome)?-(\d+)(?:-(\d+))?\s+(.+)$/i;
/** A Japanese chome written out: "Jingumae 1-chome". */
const JP_CHOME_TAIL = /\b(\d+)\s*-?\s*chome\b/i;

/** Macrons and the like, flattened — a gazetteer is likelier to hold the plain spelling. */
function deaccent(s: string): string {
  return s
    .replace(/[āăǎà-å]/g, 'a')
    .replace(/[ēĕěè-ë]/g, 'e')
    .replace(/[īĭǐì-ï]/g, 'i')
    .replace(/[ōŏǒò-öø]/g, 'o')
    .replace(/[ūŭǔù-ü]/g, 'u')
    .replace(/[ĀĂǍÀ-Å]/g, 'A')
    .replace(/[ĒĔĚÈ-Ë]/g, 'E')
    .replace(/[ĪĬǏÌ-Ï]/g, 'I')
    .replace(/[ŌŎǑÒ-ÖØ]/g, 'O')
    .replace(/[ŪŬǓÙ-Ü]/g, 'U');
}

function tidy(s: string): string {
  return s.normalize('NFKC').replace(/﻿/g, '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
}

function stripEdges(s: string): string {
  return s.replace(/^[\s,;:\-–—]+/, '').replace(/[\s,;:\-–—]+$/, '').trim();
}

/* --------------------------------------------------------------- the pieces */

interface Parts {
  /** Comma-separated pieces a gazetteer might know, narrowest first. */
  kept: string[];
  dropped: string[];
  postcode?: string;
  /** Text in brackets, which is a gloss rather than part of the address. */
  glosses: string[];
}

function split(raw: string, locale: AddressLocale): Parts {
  const dropped: string[] = [];
  const glosses: string[] = [];

  let s = tidy(deaccent(raw));

  // Brackets carry a gloss — "(Hannam-dong)", "(within Olympic Park)", "(2F)".
  s = s.replace(/\s*[（(]([^)）]*)[)）]/g, (_m, inner: string) => {
    const g = stripEdges(inner);
    if (g) glosses.push(g);
    return '';
  });

  // A postcode is worth keeping, but not inside a query that has already been
  // widened past the street: a five-digit code pinned to a whole district
  // pulls the answer somewhere arbitrary inside it.
  let postcode: string | undefined;
  const pc = s.match(POSTCODE);
  if (pc) {
    postcode = pc[1];
    s = stripEdges(s.replace(pc[0], ' '));
  }

  // Trailing prose after a dash: "…, Seoul - exact street number unconfirmed".
  s = s.replace(/\s+[-–—]\s+[^,]*$/, (m) => {
    dropped.push(stripEdges(m));
    return '';
  });

  const raws = s.split(',').map(stripEdges).filter(Boolean);
  const kept: string[] = [];
  for (const part of raws) {
    const p = part.replace(LEAD_IN, (m) => {
      dropped.push(stripEdges(m));
      return '';
    });
    const cleaned = stripEdges(p);
    if (!cleaned) continue;
    if (isNoise(cleaned, locale)) {
      dropped.push(cleaned);
      continue;
    }
    kept.push(cleaned);
  }

  return { kept, dropped, postcode, glosses };
}

/**
 * Floors and building names go; anything carrying a road, a neighbourhood or a
 * number a gazetteer could place stays, even when a building name is bolted to
 * the same piece ("63 Hanwha Life Bldg" against "50 63-ro" — the second is the
 * address, the first is how you find the lift).
 */
function isNoise(part: string, locale: AddressLocale): boolean {
  const p = part.trim();
  if (!p) return true;
  if (FLOOR.test(p)) {
    // "2F Hilltop Bldg" is a floor and a building; "2-3 Ginza" merely starts
    // with digits. Only call it noise when nothing addressable is left.
    const rest = stripEdges(p.replace(FLOOR, ''));
    return !rest || !hasAddressable(rest, locale);
  }
  if (BUILDING.test(p)) return !hasAddressable(stripEdges(p.replace(BUILDING, '')), locale);
  return false;
}

/** Whether a piece holds a road, a neighbourhood or a banchi — something placeable. */
function hasAddressable(part: string, locale: AddressLocale): boolean {
  if (!part) return false;
  if (locale === 'kr') {
    return KR_ROAD.test(part) || KR_NEIGHBOURHOOD.test(part) || KR_ROAD_NATIVE.test(part) || KR_ADMIN_NATIVE.test(part);
  }
  if (locale === 'jp') {
    return (
      JP_BANCHI.test(part) ||
      JP_CHOME_TAIL.test(part) ||
      /-(ku|shi|cho|machi)\b/i.test(part) ||
      JP_CHOME_NATIVE.test(part) ||
      JP_NUMBER_NATIVE.test(part) ||
      /[市区町村]/.test(part)
    );
  }
  return /\d/.test(part) && /[\p{L}]{3}/u.test(part);
}

/**
 * A house number stranded in its own comma group, which is how the Korean road
 * system is usually written out: "19, Dosan-daero 67-gil" is one address, not
 * two, and split by a comma neither half is findable.
 */
function joinStrandedNumber(kept: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < kept.length; i += 1) {
    const here = kept[i];
    const next = kept[i + 1];
    if (next && HOUSE_NUMBER.test(here) && KR_ROAD.test(next)) {
      out.push(`${here} ${next}`);
      i += 1;
      continue;
    }
    out.push(here);
  }
  return out;
}

/**
 * The older lot address, where the number follows the neighbourhood:
 * "Donggyo-dong 150-2" is written the other way round from what a gazetteer
 * indexes, so offer it both ways.
 */
function lotReordered(part: string): string | null {
  // Also the road written before its number — "Seobinggo-ro 137" is how the
  // Korean original reads, and the gazetteer wants the number in front.
  const m = part.match(/^(.*?(?:-ro|-gil|-daero|-?dong|\d+-ga))\s+(\d+(?:-\d+)?)$/i);
  if (!m) return null;
  return `${m[2]} ${m[1]}`;
}

/**
 * Korean road names are one word in the gazetteer even where they are written
 * as several: "World Cup buk-ro" is indexed as "Worldcupbuk-ro". Only offered
 * as an extra rung, never as a replacement.
 */
function compactRoad(part: string): string | null {
  const m = part.match(/^(\d+(?:-\d+)?\s+)?((?:[A-Za-z]+ ){1,3})([A-Za-z]+-(?:daero|ro|gil))(.*)$/);
  if (!m) return null;
  const words = m[2].trim().split(' ');
  if (words.some((w) => /\d/.test(w))) return null;
  const compact = (words.join('') + m[3].charAt(0).toUpperCase() + m[3].slice(1)).replace(/^(.)/, (c) => c.toUpperCase());
  const rebuilt = `${m[1] ?? ''}${compact}${m[4]}`;
  return rebuilt === part ? null : rebuilt;
}

/** "1-2-3 Jingumae" → "Jingumae 1-chome", the block rather than the building. */
function jpChome(part: string): string | null {
  const m = part.match(JP_BANCHI);
  if (!m) return null;
  return `${m[4].trim()} ${m[1]}-chome`;
}

/**
 * Whether a piece carries a number that names a building rather than a road or
 * a block: a Korean house number, a Japanese banchi, an old lot number, or the
 * digits that end a native-script address.
 */
function hasBuildingNumber(part: string): boolean {
  if (/^\d+(-\d+)?\s/.test(part)) return true;
  if (JP_BANCHI.test(part)) return true;
  if (lotReordered(part)) return true;
  if (JP_NUMBER_NATIVE.test(part)) return true;
  // A native Korean address ends with its house number and no space before the
  // road: 서빙고로 137 names a building as surely as "137 Seobinggo-ro" does.
  if (KR_NUMBER_NATIVE.test(part)) return true;
  // Otherwise a native address that ends in a run of numbers: 歌舞伎町1-2-3.
  return (HANGUL.test(part) || KANA.test(part) || HAN.test(part)) && /\d+(?:[-−]\d+)+\s*$/.test(part);
}

/**
 * A native Korean address runs largest first and carries no commas, so the road
 * and the district have to be cut out of the string rather than dropped off the
 * end of a list. 서울특별시 용산구 서빙고로 137 gives up 서울특별시 용산구 서빙고로
 * and 서울특별시 용산구.
 */
function krNativeSteps(part: string): { road: string | null; area: string | null } {
  const road = KR_NUMBER_NATIVE.test(part) ? stripEdges(part.replace(KR_NUMBER_NATIVE, (m) => m.replace(/\d+(?:-\d+)?\s*(?:번지)?\s*$/, ''))) : null;
  const admin = part.match(/^(.*?(?:특별시|광역시|자치시|시|도))?\s*(.*?(?:구|군))\b/);
  const area = admin ? stripEdges(`${admin[1] ?? ''} ${admin[2]}`) : null;
  return {
    road: road && road !== part ? road : null,
    area: area && area !== part ? area : null,
  };
}

/** The ward and prefecture of a native Japanese address, which runs largest first. */
function jpNativeArea(part: string): string | null {
  const m = part.match(/^(.*?[都道府県])?(.*?[市区])/);
  if (!m) return null;
  const area = `${m[1] ?? ''}${m[2]}`;
  return area && area !== part ? area : null;
}

/** The chome of a native Japanese address, dropping the banchi and go after it. */
function jpNativeChome(part: string): string | null {
  const m = part.match(/^(.*?\d+\s*丁目)/);
  if (!m) return null;
  return m[1] !== part ? m[1] : null;
}

/** Strip a house number from the front of a piece, leaving the road. */
function dropHouseNumber(part: string): string {
  return stripEdges(part.replace(/^\d+(-\d+)?(?=\s)/, ''));
}

/* ------------------------------------------------------------ the normaliser */

/**
 * Take an address apart. The result says what the address is made of and how
 * exact an answer about it could honestly be; `queryLadder` turns it into the
 * list of ways to ask.
 */
export function normalizeAddress(raw: string): NormalizedAddress {
  const original = tidy(raw);
  const locale = detectLocale(original);
  const { kept, dropped, postcode, glosses } = split(original, locale);
  const joined = joinStrandedNumber(kept);

  // Where the address says of itself that it is an area, no answer about it may
  // claim to be a door. This is the whole of "without the address becoming
  // incorrect": the pin is still placed, and still labelled as a guess.
  const confesses = NOT_A_POINT.test(original) || glosses.some((g) => NOT_A_POINT.test(g));
  const hasNumber = joined.some(hasBuildingNumber);
  const chomeOnly = !hasNumber && joined.some((p) => JP_CHOME_TAIL.test(p) || JP_CHOME_NATIVE.test(p));
  const ceiling: GeocodePrecision = confesses
    ? 'area'
    : hasNumber
      ? 'exact'
      : chomeOnly
        ? 'block'
        : 'area';

  const query = withCountry(joined.join(', ') || original, locale);

  return { original, locale, query, dropped, postcode, ceiling };
}

function withCountry(q: string, locale: AddressLocale): string {
  const country = COUNTRY[locale];
  if (!country || !q) return q;
  if (COUNTRY_NAMED[locale].test(q)) return q;
  return `${q}, ${country}`;
}

/**
 * The ways to ask, narrowest first, each labelled with how exact an answer
 * from it could be. The address exactly as typed goes first, so anything that
 * already worked keeps working; everything after it is this file earning its
 * keep.
 */
export function queryLadder(raw: string): AddressQuery[] {
  const norm = normalizeAddress(raw);
  const { locale, ceiling, postcode } = norm;
  const { kept, glosses } = split(norm.original, locale);
  const parts = joinStrandedNumber(kept);
  const steps: AddressQuery[] = [];

  const add = (q: string, precision: GeocodePrecision) => {
    const trimmed = stripEdges(q);
    if (trimmed) steps.push({ q: trimmed, precision: coarser(precision, ceiling) });
  };

  // As typed, then as typed with the country named — the cheapest fix there is
  // for a romanised Korean address, which Nominatim often places in Europe
  // until it is told which country to look in.
  add(norm.original, 'exact');
  add(withCountry(norm.original, locale), 'exact');

  // Stripped of floors, buildings, brackets and prose.
  add(norm.query, 'exact');
  add(parts.join(', '), 'exact');

  if (parts.length) {
    // A place name in front of the address ("UNESCO House, 26 Myeongdong-gil")
    // is not a floor or a building keyword, so it survives the tidying — but a
    // gazetteer does better without it. Drop the leading pieces it cannot
    // place, and search from the first piece it can.
    const firstPlaceable = parts.findIndex((p) => hasAddressable(p, locale));
    if (firstPlaceable > 0) {
      const withoutName = parts.slice(firstPlaceable);
      add(withCountry(withoutName.join(', '), locale), hasBuildingNumber(withoutName[0]) ? 'exact' : 'road');
    }

    const body = firstPlaceable > 0 ? parts.slice(firstPlaceable) : parts;
    const head = body[0];
    const tail = body.slice(1);

    // The lot form written the way a gazetteer indexes it.
    const lot = lotReordered(head);
    if (lot) add(withCountry([lot, ...tail].join(', '), locale), 'exact');

    // The road name as one word, which is how Korean roads are indexed.
    const compact = compactRoad(head);
    if (compact) add(withCountry([compact, ...tail].join(', '), locale), 'exact');

    // The block rather than the building — the useful middle rung in Tokyo,
    // where a banchi is rarely mapped but a chome always is. Japanese only: a
    // Korean "8-1 Dosan-daero 45-gil" has the same shape and no chome in it.
    if (locale === 'jp') {
      const chome = jpChome(head);
      if (chome) add(withCountry([chome, ...tail].join(', '), locale), 'block');
    }

    // A native Japanese address carries no commas, so the ward has to be cut
    // out of the string rather than dropped off the end of a list.
    if (locale === 'jp' && !tail.length) {
      const chome = jpNativeChome(head);
      if (chome) add(chome, 'block');
      const native = jpNativeArea(head);
      if (native) add(native, 'area');
    }

    // The same for a native Korean one: the road, then the district.
    if (locale === 'kr' && HANGUL.test(head)) {
      const native = krNativeSteps(head);
      if (native.road) add([native.road, ...tail].join(', '), 'road');
      if (native.area) add([native.area, ...tail].join(', '), 'area');
    }

    // The road without the number: the right street, the wrong door.
    const road = dropHouseNumber(head);
    if (road && road !== head) {
      add(withCountry([road, ...tail].join(', '), locale), 'road');
      const compactRoadOnly = compactRoad(road);
      if (compactRoadOnly) add(withCountry([compactRoadOnly, ...tail].join(', '), locale), 'road');
    }

    // A postcode names a few blocks in both countries, which beats a district.
    if (postcode && tail.length) add(withCountry([postcode, ...tail].join(', '), locale), 'block');

    // A neighbourhood named in a bracket, which is often the only placeable
    // thing in an address that never had a number.
    for (const gloss of glosses) {
      if (hasAddressable(gloss, locale)) add(withCountry([gloss, ...tail].join(', '), locale), 'area');
    }

    // The district, and nothing narrower. Dropping further, to the city alone,
    // is not worth doing: a pin on Seoul city hall says less than no pin, so
    // the last rung keeps at least a district above the city.
    if (tail.length > 1) add(withCountry(tail.join(', '), locale), 'area');
  }

  const seen = new Set<string>();
  return steps.filter((s) => {
    const k = s.q.toLowerCase();
    if (s.q.length < 4 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
