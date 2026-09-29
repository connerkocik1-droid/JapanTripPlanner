import { LatLng } from './data';

export type Lng2 = [number, number];

/** MapLibre wants [lng, lat]; the trip data is stored [lat, lng]. */
export function toLngLat(ll: LatLng): Lng2 {
  return [ll[1], ll[0]];
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
