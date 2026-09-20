import { LatLng } from './data';

export type Lng2 = [number, number];

/** MapLibre wants [lng, lat]; the trip data is stored [lat, lng]. */
export function toLngLat(ll: LatLng): Lng2 {
  return [ll[1], ll[0]];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Great-circle interpolation. A two-point LineString is drawn as a straight
 * line in the projected plane, which at Seoul–Tokyo distances visibly departs
 * from the real path; densifying along the great circle keeps the route honest.
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
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return out;
}

/** The whole route as one densified line through the cities, in order. */
export function routeLine(points: LatLng[]): Lng2[] {
  if (points.length < 2) return points.map(toLngLat);
  const out: Lng2[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const seg = greatCircle(points[i], points[i + 1]);
    out.push(...(i ? seg.slice(1) : seg));
  }
  return out;
}

/** A short stub running off-frame from `from` toward `to` (the home airport). */
export function stub(from: LatLng, to: LatLng, fraction = 0.12): Lng2[] {
  return greatCircle(from, to, 64).slice(0, Math.max(2, Math.round(64 * fraction)));
}

export function boundsOf(points: Lng2[]): [Lng2, Lng2] | null {
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
