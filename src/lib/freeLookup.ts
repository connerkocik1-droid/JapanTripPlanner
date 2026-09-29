import type { PlaceFacts } from './placeDetails';
import {
  commonsFileUrl, cuisineFromOsm, hoursFromOsm, imageFromTag, sameName, wikipediaRef,
} from './osmFacts';

/**
 * A place's cuisine, hours, website and — where one exists — photograph, from
 * sources that cost nothing and need no account: OpenStreetMap for the facts,
 * Wikipedia and Wikimedia Commons for the picture.
 *
 * Server-side only. Nominatim's usage policy asks for an identifying
 * User-Agent and no more than a request a second, and Wikimedia's asks for the
 * same courtesy, so every call goes out from here with a name on it and is
 * cached, and the browser paces its queue to match.
 *
 * What this cannot give is a rating, or a photograph of a restaurant nobody
 * has put on Wikipedia. Those stay blank rather than being guessed.
 */

const NOMINATIM = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org/search';
const CONTACT = process.env.GEOCODER_CONTACT ?? 'japan-trip-planner';
const HEADERS = { 'User-Agent': `TripPlanner/1.0 (${CONTACT})`, 'Accept-Language': 'en' };

/** Nominatim asks for a second between requests. */
const GAP_MS = 1100;

export interface FreeQuery {
  name: string;
  addr: string;
  /** 'eat' or 'do' — only a sight is worth a Wikipedia search by name. */
  kind: string;
  city: string;
  /** Where the place is already pinned, which is the best way to find it. */
  ll: [number, number] | null;
}

interface Hit {
  name?: string;
  category?: string;
  type?: string;
  extratags?: Record<string, string> | null;
}

/**
 * The kinds of thing a place can be. A search for a restaurant's name that
 * comes back as a district, a road or a station has found the wrong thing, and
 * its tags would describe somewhere else.
 */
const WRONG = new Set(['place', 'boundary', 'highway', 'railway', 'landuse', 'waterway', 'natural']);

async function nominatim(params: Record<string, string>): Promise<Hit | null> {
  const qs = new URLSearchParams({ format: 'jsonv2', limit: '1', extratags: '1', ...params });
  const res = await fetch(`${NOMINATIM}?${qs.toString()}`, { headers: HEADERS, cache: 'force-cache' });
  if (!res.ok) throw new Error('nominatim ' + res.status);
  const hits = (await res.json()) as Hit[];
  const hit = hits[0];
  if (!hit || WRONG.has(hit.category ?? '')) return null;
  return hit;
}

/**
 * Find the place in OpenStreetMap: first by name within a kilometre or so of
 * its pin, which is how a chain's right branch is found; then by name and
 * address, then by name and city, for a place that has no pin yet.
 */
async function findInOsm(q: FreeQuery): Promise<Hit | null> {
  const tries: Record<string, string>[] = [];
  if (q.ll) {
    const [lat, lon] = q.ll;
    const d = 0.01;
    tries.push({ q: q.name, viewbox: `${lon - d},${lat + d},${lon + d},${lat - d}`, bounded: '1' });
  }
  if (q.addr) tries.push({ q: `${q.name}, ${q.addr}` });
  else if (q.city) tries.push({ q: `${q.name}, ${q.city}` });

  for (let i = 0; i < tries.length; i += 1) {
    if (i > 0) await new Promise((r) => setTimeout(r, GAP_MS));
    const hit = await nominatim(tries[i]);
    if (hit) return hit;
  }
  return null;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, cache: 'force-cache' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** A card-sized thumbnail: Wikipedia hands back 320px, and asks for any width. */
const cardSized = (src: string) => src.replace(/\/\d+px-/, '/640px-');

async function photoFromWikipedia(lang: string, title: string): Promise<string> {
  const body = await getJson<{ thumbnail?: { source?: string } }>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  );
  const src = body?.thumbnail?.source;
  return src ? cardSized(src) : '';
}

async function photoFromWikidata(id: string): Promise<string> {
  if (!/^Q\d+$/.test(id)) return '';
  const body = await getJson<{
    entities?: Record<string, { claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } }>;
  }>(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
  const file = body?.entities?.[id]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return file ? commonsFileUrl(file) : '';
}

/**
 * A sight with no link from OSM, looked up on English Wikipedia by name. Only
 * for sights: a famous temple has an article with its picture on it, and a
 * ramen shop that shares a name with a town does not want that town's photo.
 */
async function photoBySearch(name: string, city: string): Promise<string> {
  const qs = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrlimit: '1',
    gsrsearch: [name, city].filter(Boolean).join(' '),
    prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '640',
  });
  const body = await getJson<{ query?: { pages?: Record<string, { title?: string; thumbnail?: { source?: string } }> } }>(
    `https://en.wikipedia.org/w/api.php?${qs.toString()}`,
  );
  const page = Object.values(body?.query?.pages ?? {})[0];
  if (!page?.thumbnail?.source || !sameName(page.title ?? '', name)) return '';
  return page.thumbnail.source;
}

/**
 * Everything the free sources know about one place, or null when none of them
 * has heard of it. Throws only when OpenStreetMap itself could not be reached,
 * so the caller can tell "nothing found" from "try again later".
 */
export async function freeFacts(q: FreeQuery): Promise<PlaceFacts | null> {
  const hit = await findInOsm(q);
  const tags = hit?.extratags ?? {};

  let photo = imageFromTag(tags.image);
  const wiki = wikipediaRef(tags.wikipedia);
  if (!photo && wiki) photo = await photoFromWikipedia(wiki.lang, wiki.title);
  if (!photo && tags.wikidata) photo = await photoFromWikidata(tags.wikidata);
  if (!photo && q.kind === 'do') photo = await photoBySearch(hit?.name || q.name, q.city);

  const facts: PlaceFacts = {};
  const cuisine = cuisineFromOsm(tags.cuisine, hit?.category === 'amenity' ? hit.type : '');
  if (cuisine) facts.cuisine = cuisine;
  const hours = hoursFromOsm(tags.opening_hours);
  if (hours) Object.assign(facts, hours);
  const url = tags.website || tags['contact:website'] || tags.url || '';
  if (/^https?:\/\//.test(url)) facts.url = url;
  if (photo) facts.images = [photo];

  return Object.keys(facts).length ? facts : null;
}
