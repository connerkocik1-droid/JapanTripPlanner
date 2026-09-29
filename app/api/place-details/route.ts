import { NextResponse } from 'next/server';
import { cuisineFromTypes } from '@/lib/placeDetails';

/**
 * What a place looks like, what it is rated and what it serves — from Google
 * Places, proxied so the key never reaches the browser.
 *
 * This is the one thing in the app that cannot be worked out from what the
 * travelers typed, so it is also the one thing that needs an account. Without
 * a key the route answers `configured: false` and the app carries on showing
 * whatever the shortlists already carry: no error, no empty state, no nagging.
 * Set GOOGLE_PLACES_API_KEY and the photographs and hours appear on their own.
 *
 * Nothing here invents anything. A place the directory does not know comes
 * back as `null` and stays as the travelers wrote it, because a plausible
 * rating on the wrong restaurant is worse than no rating at all.
 */

const SEARCH = 'https://places.googleapis.com/v1/places:searchText';

/** Only what the app shows, so the answer stays small and the bill stays low. */
const FIELDS = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.types',
  'places.regularOpeningHours',
  'places.websiteUri',
  'places.photos',
].join(',');

/**
 * Dynamic, not prerendered. The answer depends entirely on the name and address
 * asked about, and a route Next decided to render at build time would bake one
 * query's answer — or, before the key is set, "not configured" — into the
 * deployment for good. The upstream fetch is cached instead, which is where the
 * saving actually is.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Period {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
}

interface Found {
  id?: string;
  rating?: number;
  userRatingCount?: number;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  regularOpeningHours?: { periods?: Period[] };
  websiteUri?: string;
  photos?: { name?: string }[];
}

const hhmm = (h: number, m: number): string =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/**
 * A week of opening times boiled down to the one line the app keeps: when it
 * usually opens, when it usually shuts, and the weekdays it does neither.
 *
 * The app holds one pair of times per place rather than seven, so the most
 * common opening and the most common closing are the honest summary. A day
 * with no period at all is a closed day, which is what the hours warnings
 * already know how to say.
 */
function hoursOf(periods: Period[]): { opens: string; closes: string; shutDays: number[] } {
  const opens: string[] = [];
  const closes: string[] = [];
  const seen = new Set<number>();
  periods.forEach((p) => {
    if (p.open && typeof p.open.day === 'number') {
      seen.add(p.open.day);
      opens.push(hhmm(p.open.hour ?? 0, p.open.minute ?? 0));
    }
    if (p.close) closes.push(hhmm(p.close.hour ?? 0, p.close.minute ?? 0));
  });
  // No periods at all means "open 24 hours" in Places' vocabulary, not "shut".
  if (!periods.length) return { opens: '', closes: '', shutDays: [] };
  const shutDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !seen.has(d));
  return { opens: commonest(opens), closes: commonest(closes), shutDays };
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

export async function GET(req: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ configured: false, result: null });

  const params = new URL(req.url).searchParams;
  const name = params.get('name')?.trim() ?? '';
  const addr = params.get('addr')?.trim() ?? '';
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });

  try {
    const res = await fetch(SEARCH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELDS,
      },
      body: JSON.stringify({
        textQuery: [name, addr].filter(Boolean).join(', '),
        maxResultCount: 1,
        languageCode: 'en',
      }),
      cache: 'force-cache',
    });
    if (!res.ok) {
      // Usually the key: Places API (New) not enabled on its project, or the
      // key restricted to websites, which a server call can never satisfy.
      // Google says which in the body, so it goes to the logs and the answer.
      const detail = (await res.text()).slice(0, 500);
      console.error('place-details: Google Places answered', res.status, detail);
      return NextResponse.json(
        { configured: true, result: null, error: `google ${res.status}`, detail },
        { status: 502 },
      );
    }

    const body = (await res.json()) as { places?: Found[] };
    const hit = body.places?.[0];
    if (!hit) return NextResponse.json({ configured: true, result: null });

    const hours = hoursOf(hit.regularOpeningHours?.periods ?? []);
    // Photographs come back as handles, not URLs: the bytes are behind the key
    // too, so the app points at its own proxy and the key stays on the server.
    const images = (hit.photos ?? [])
      .map((p) => p.name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 3)
      .map((n) => '/api/place-photo?ref=' + encodeURIComponent(n));

    return NextResponse.json({
      configured: true,
      result: {
        rating: typeof hit.rating === 'number' ? hit.rating : 0,
        ratingCount: typeof hit.userRatingCount === 'number' ? hit.userRatingCount : 0,
        cuisine: cuisineFromTypes(hit.types ?? [], hit.primaryTypeDisplayName?.text ?? ''),
        images,
        url: typeof hit.websiteUri === 'string' ? hit.websiteUri : '',
        ...hours,
      },
    });
  } catch {
    return NextResponse.json({ configured: true, result: null }, { status: 502 });
  }
}
