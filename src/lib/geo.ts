import { LatLng } from './data';

export type Lng2 = [number, number];

/** MapLibre wants [lng, lat]; the trip data is stored [lat, lng]. */
export function toLngLat(ll: LatLng): Lng2 {
  return [ll[1], ll[0]];
}

/** One city on the route, and how you arrived at it from the one before. */
export interface RouteStop {
  ll: LatLng;
  /** True when the leg into this city is flown, so it is drawn as a flight. */
  flight?: boolean;
}

/** One city-to-city leg, densified and ready for the map. */
export interface RouteSegment {
  flight: boolean;
  line: Lng2[];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * `lng` moved by whole turns of the globe until it sits next to `near`.
 *
 * Longitude is cyclic, so a Pacific crossing that steps from -178 to +179 is a
 * two-degree hop the map has no way to tell from a 358-degree one back across
 * Eurasia — and it draws the long one. Keeping every point in the same frame as
 * the point before it leaves no jump to misread; MapLibre repeats the world, so
 * a line running past 180 lands where it should.
 */
function sameFrame(near: number, lng: number): number {
  return lng + Math.round((near - lng) / 360) * 360;
}

/**
 * Great-circle interpolation. A two-point LineString is drawn as a straight
 * line in the projected plane, which at Seoul–Tokyo distances visibly departs
 * from the real path; densifying along the great circle keeps the route honest.
 *
 * Longitudes run continuously from `a`, so the line may leave -180..180 rather
 * than wrap. See {@link sameFrame}.
 */
export function greatCircle(a: LatLng, b: LatLng, steps = 48): Lng2[] {
  const [lat1, lon1] = [rad(a[0]), rad(a[1])];
  const [lat2, lon2] = [rad(b[0]), rad(b[1])];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (!d) return [toLngLat(a), toLngLat(b)];
  const out: Lng2[] = [];
  let prev = a[1];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    const lng = sameFrame(prev, deg(Math.atan2(y, x)));
    prev = lng;
    out.push([lng, deg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return out;
}

/**
 * The trip's legs, in order, each densified along the great circle. Every leg
 * carries on from where the last one ended rather than restarting inside
 * -180..180, so a trip that crosses the dateline stays one continuous path.
 */
export function routeSegments(stops: RouteStop[]): RouteSegment[] {
  const out: RouteSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const seg = greatCircle(stops[i].ll, stops[i + 1].ll);
    const prev = out[out.length - 1]?.line;
    const end = prev ? prev[prev.length - 1][0] : seg[0][0];
    const shift = sameFrame(end, seg[0][0]) - seg[0][0];
    out.push({
      flight: !!stops[i + 1].flight,
      line: shift ? seg.map(([lng, lat]): Lng2 => [lng + shift, lat]) : seg,
    });
  }
  return out;
}

/**
 * A box around the points, taking longitude the short way round. A trip from
 * California to Tokyo spans 102 degrees across the Pacific, not the 258 the
 * plain minimum and maximum would give; the eastern edge runs past 180 to say
 * so, which is how MapLibre expects to be asked for the far side.
 */
export function boundsOf(points: Lng2[]): [Lng2, Lng2] | null {
  if (!points.length) return null;
  const lats = points.map((p) => p[1]);
  const lngs = points.map((p) => (((p[0] % 360) + 540) % 360) - 180).sort((a, b) => a - b);

  // The widest gap between neighbouring longitudes is the slice of the globe
  // the trip never touches; the box is everything except that slice.
  let cut = 0;
  let widest = lngs[0] + 360 - lngs[lngs.length - 1];
  for (let i = 1; i < lngs.length; i++) {
    const gap = lngs[i] - lngs[i - 1];
    if (gap > widest) {
      widest = gap;
      cut = i;
    }
  }

  return [
    [lngs[cut], Math.min(...lats)],
    [cut ? lngs[cut - 1] + 360 : lngs[lngs.length - 1], Math.max(...lats)],
  ];
}
