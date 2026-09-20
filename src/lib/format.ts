import { CUR, LatLng, RATE, START } from './data';

export function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function fmtLocal(n: number, city: string): string {
  const r = RATE[city];
  if (!r) return '';
  const v = n * r;
  const rounded = r > 500 ? Math.round(v / 100) * 100 : Math.round(v / 10) * 10;
  return CUR[city] + rounded.toLocaleString('en-US');
}

export function money(n: number, city: string, localOn = true): string {
  if (!n) return '—';
  const l = localOn ? fmtLocal(n, city) : '';
  return l ? fmtUsd(n) + '  ' + l : fmtUsd(n);
}

export function dateOf(i: number): Date {
  return new Date(START.getFullYear(), START.getMonth(), START.getDate() + i);
}

export function fmtD(dt: Date): string {
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDow(dt: Date): string {
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
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

export function walkLabel(from: LatLng | null | undefined, to: LatLng): string {
  const km = kmBetween(from, to);
  if (km === null) return 'Set hotel address';
  const street = km * 1.25;
  const mins = Math.round((street / 4.8) * 60);
  const dist = street < 1 ? Math.round(street * 1000) + ' m' : street.toFixed(1) + ' km';
  return mins <= 35 ? dist + ' · ' + mins + ' min walk' : dist + ' · transit';
}
