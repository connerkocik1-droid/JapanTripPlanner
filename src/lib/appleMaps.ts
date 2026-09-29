/**
 * Handing a pin over to Apple Maps.
 *
 * The app plans the trip; it does not walk you there. Once you are standing in
 * Seoul wanting the turn-by-turn, the address has to leave this app and land in
 * the one your phone actually navigates with — so every card that opens over a
 * pin offers the same one-tap way out.
 *
 * Both the address and the coordinates are sent when both are known. The
 * address is what a person reads, and what Apple shows as the label; the
 * coordinates are what makes it land on the building rather than on Apple's
 * best guess at a romanised Korean street name. Either alone is enough, and
 * with neither there is nothing to open, so the button does not appear.
 */

import { LatLng } from './data';

export interface MapTarget {
  /** What to call it on the other side. */
  name?: string;
  /** The address as it was typed, in whatever script it was typed in. */
  addr?: string;
  ll?: LatLng | null;
}

export function appleMapsUrl({ name, addr, ll }: MapTarget): string | null {
  const label = (name ?? '').trim();
  const where = (addr ?? '').trim();
  if (!where && !ll) return null;

  const q = new URLSearchParams();
  // `q` is the label, not the search, whenever an address or a coordinate says
  // where to go — so an unnamed pin falls back to its address rather than
  // opening Apple Maps on an empty search.
  q.set('q', label || where);
  if (where) q.set('address', where);
  if (ll) q.set('ll', ll[0] + ',' + ll[1]);
  return 'https://maps.apple.com/?' + q.toString();
}

/**
 * The same place on Google Maps, where its photographs and reviews are — the
 * free way to see them, since reading them into the app would need a paid key.
 * A search by name and address, which is Google's documented link format and
 * lands on the place itself whenever the name is specific enough.
 */
export function googleMapsUrl({ name, addr, ll }: MapTarget): string | null {
  const label = (name ?? '').trim();
  const where = (addr ?? '').trim();
  const query = [label, where].filter(Boolean).join(', ') || (ll ? ll[0] + ',' + ll[1] : '');
  if (!query) return null;
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}
