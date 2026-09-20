import { LatLng } from './data';

export function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** Blank figures read as "—" rather than "$0". */
export function money(n: number): string {
  return n ? fmtUsd(n) : '—';
}

/** Parse a YYYY-MM-DD trip start into a local date (no timezone drift). */
export function parseStart(start: string): Date {
  const [y, m, d] = start.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function dateOf(start: string, i: number): Date {
  const s = parseStart(start);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() + i);
}

export function fmtD(dt: Date): string {
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDow(dt: Date): string {
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
}

export function daysUntil(start: string): number {
  const s = parseStart(start);
  return Math.max(0, Math.ceil((s.getTime() - Date.now()) / 86400000));
}

// Haversine, then a 4.8 km/h walking pace with a 1.25 street-grid factor.
export function kmBetween(a: LatLng | null | undefined, b: LatLng | null | undefined): number | null {
  if (!a || !b) return null;
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Walking time from the selected hotel, once both ends have coordinates. */
export function walkLabel(from: LatLng | null | undefined, to: LatLng | null | undefined): string | null {
  const km = kmBetween(from, to);
  if (km === null) return null;
  const street = km * 1.25;
  const mins = Math.round((street / 4.8) * 60);
  const dist = street < 1 ? Math.round(street * 1000) + ' m' : street.toFixed(1) + ' km';
  return mins <= 35 ? dist + ' · ' + mins + ' min walk' : dist + ' · transit';
}
