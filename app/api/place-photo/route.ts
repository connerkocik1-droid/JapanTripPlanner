import { NextResponse } from 'next/server';

/**
 * One of a place's photographs, by the handle the details lookup handed back.
 *
 * The bytes live behind the same key as the details, so an `<img src>` cannot
 * point at Google directly without putting the key in the page. This route
 * asks Places for the real URL and redirects to it, which keeps the key on the
 * server and keeps the browser's own image cache doing the work.
 *
 * `ref` is echoed straight into an upstream URL, so it is checked against the
 * exact shape Places issues rather than trusted: a handle is a place id and a
 * photo id and nothing else, and anything other than that is refused instead
 * of being fetched on the caller's behalf.
 */

const HANDLE = /^places\/[A-Za-z0-9_-]{1,128}\/photos\/[A-Za-z0-9_-]{1,512}$/;

/** Dynamic for the same reason the details route is: the answer is per-photo. */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'not configured' }, { status: 404 });

  const params = new URL(req.url).searchParams;
  const ref = params.get('ref')?.trim() ?? '';
  if (!HANDLE.test(ref)) return NextResponse.json({ error: 'bad ref' }, { status: 400 });

  // Wide enough for the card on a phone at two-times pixel density, and no
  // wider — these are thumbnails on a map, not wallpaper.
  const width = Math.min(1200, Math.max(200, Number(params.get('w')) || 640));

  try {
    const url =
      `https://places.googleapis.com/v1/${ref}/media` +
      `?maxWidthPx=${width}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return NextResponse.json({ error: 'no photo' }, { status: 404 });
    const body = (await res.json()) as { photoUri?: string };
    if (!body.photoUri) return NextResponse.json({ error: 'no photo' }, { status: 404 });
    return NextResponse.redirect(body.photoUri, {
      status: 307,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'unreachable' }, { status: 502 });
  }
}
