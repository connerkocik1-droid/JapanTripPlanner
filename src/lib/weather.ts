'use client';

/**
 * The weather where the day is, from Open-Meteo: free, no key, no account.
 *
 * Asked straight from the browser, like the exchange rate, and kept on the
 * device for half an hour so that flicking between tabs costs nothing and a
 * basement with no signal still shows the last reading, labelled with when it
 * was taken.
 */

import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from './data';

export interface Weather {
  /** When this was read, as an ISO time — for saying how old it is. */
  at: string;
  tempF: number;
  feelsF: number;
  code: number;
  isDay: boolean;
  highF: number;
  lowF: number;
  /** Chance of rain at some point today, 0–100. */
  rainPct: number;
  /** "05:48", local to the city. */
  sunrise: string;
  sunset: string;
  /** The next few hours: local hour, °F, chance of rain, WMO code. */
  hours: { hour: string; tempF: number; rainPct: number; code: number }[];
}

const SOURCE = 'https://api.open-meteo.com/v1/forecast';
const KEEP_MS = 30 * 60 * 1000;
const STORE_PREFIX = 'trip-planner:weather:';

/** What each WMO weather code looks like, in words and as a Phosphor glyph. */
export function describe(code: number, isDay = true): { text: string; icon: string } {
  if (code === 0) return isDay ? { text: 'Clear', icon: 'ph-sun' } : { text: 'Clear', icon: 'ph-moon-stars' };
  if (code === 1 || code === 2) {
    return isDay ? { text: 'Partly cloudy', icon: 'ph-cloud-sun' } : { text: 'Partly cloudy', icon: 'ph-cloud-moon' };
  }
  if (code === 3) return { text: 'Overcast', icon: 'ph-cloud' };
  if (code === 45 || code === 48) return { text: 'Fog', icon: 'ph-cloud-fog' };
  if (code >= 51 && code <= 57) return { text: 'Drizzle', icon: 'ph-cloud-rain' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { text: code >= 65 && code !== 80 ? 'Heavy rain' : 'Rain', icon: 'ph-cloud-rain' };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { text: 'Snow', icon: 'ph-cloud-snow' };
  if (code >= 95) return { text: 'Thunderstorms', icon: 'ph-cloud-lightning' };
  return { text: 'Unsettled', icon: 'ph-cloud' };
}

/** °F to °C, whole degrees. */
export const toC = (f: number): number => Math.round(((f - 32) * 5) / 9);

/** "06:05" off Open-Meteo's local "2026-09-30T06:05". */
const clockOf = (iso: unknown): string => (typeof iso === 'string' ? iso.slice(11, 16) : '');

/** Open-Meteo's answer, flattened to what the card shows. Exported for tests. */
export function parseWeather(body: unknown, at: string): Weather | null {
  const b = body as {
    current?: Record<string, unknown>;
    daily?: Record<string, unknown[]>;
    hourly?: Record<string, unknown[]>;
  };
  const c = b?.current;
  if (!c || typeof c.temperature_2m !== 'number') return null;
  const day = (k: string) => b.daily?.[k]?.[0];
  const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

  // The hourly series starts at midnight; the next five from now are the ones
  // worth showing, found by the current reading's own local hour.
  const times = (b.hourly?.time ?? []) as string[];
  const nowHour = typeof c.time === 'string' ? c.time.slice(0, 13) : '';
  const from = Math.max(0, times.findIndex((t) => t.slice(0, 13) === nowHour) + 1);
  const hours = times.slice(from, from + 5).map((t, i) => ({
    hour: t.slice(11, 16),
    tempF: Math.round(num(b.hourly?.temperature_2m?.[from + i])),
    rainPct: Math.round(num(b.hourly?.precipitation_probability?.[from + i])),
    code: num(b.hourly?.weather_code?.[from + i]),
  }));

  return {
    at,
    tempF: Math.round(c.temperature_2m),
    feelsF: Math.round(num(c.apparent_temperature, c.temperature_2m)),
    code: num(c.weather_code),
    isDay: c.is_day !== 0,
    highF: Math.round(num(day('temperature_2m_max'))),
    lowF: Math.round(num(day('temperature_2m_min'))),
    rainPct: Math.round(num(day('precipitation_probability_max'))),
    sunrise: clockOf(day('sunrise')),
    sunset: clockOf(day('sunset')),
    hours,
  };
}

function storeKey(ll: LatLng): string {
  return STORE_PREFIX + ll[0].toFixed(2) + ',' + ll[1].toFixed(2);
}

function readStored(ll: LatLng): Weather | null {
  try {
    const raw = window.localStorage.getItem(storeKey(ll));
    return raw ? (JSON.parse(raw) as Weather) : null;
  } catch {
    return null;
  }
}

function writeStored(ll: LatLng, w: Weather): void {
  try {
    window.localStorage.setItem(storeKey(ll), JSON.stringify(w));
  } catch {
    /* storage blocked — it is just asked again next time */
  }
}

/**
 * The weather at a place, or the last reading this device has for it.
 * Nothing throws and nothing blocks; without an answer the card is not shown.
 */
export function useWeather(ll: LatLng | null): { weather: Weather | null; refresh: () => void } {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [nonce, setNonce] = useState(0);
  const lat = ll?.[0];
  const lon = ll?.[1];

  useEffect(() => {
    if (lat === undefined || lon === undefined) {
      setWeather(null);
      return undefined;
    }
    const here: LatLng = [lat, lon];
    const stored = readStored(here);
    setWeather(stored);
    if (stored && nonce === 0 && Date.now() - Date.parse(stored.at) < KEEP_MS) return undefined;

    let live = true;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const qs = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: 'temperature_2m,apparent_temperature,weather_code,is_day',
      hourly: 'temperature_2m,precipitation_probability,weather_code',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
      temperature_unit: 'fahrenheit',
      timezone: 'auto',
      forecast_days: '2',
    });
    (async () => {
      try {
        const res = await fetch(`${SOURCE}?${qs.toString()}`, { signal: ac.signal });
        if (!res.ok) return;
        const w = parseWeather(await res.json(), new Date().toISOString());
        if (!live || !w) return;
        setWeather(w);
        writeStored(here, w);
      } catch {
        /* offline or too slow — the stored reading stands */
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      live = false;
      ac.abort();
      clearTimeout(timer);
    };
  }, [lat, lon, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { weather, refresh };
}
