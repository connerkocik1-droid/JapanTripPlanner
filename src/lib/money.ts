'use client';

/**
 * What a dollar figure is worth where you are standing.
 *
 * Every amount in the plan is authored in dollars, because that is the
 * currency the two of you think in. On the trip you read prices in won and
 * yen, so each city carries the currency it spends in and the app shows the
 * local figure beside the dollar one.
 *
 * The rate is the day's, fetched once and kept. It is deliberately not fetched
 * per screen or per amount: it is one number a day, and the app has to keep
 * working on a phone with no signal in a Tokyo basement. So the last rate is
 * stored with the date it was for, an older one is used and labelled rather
 * than dropped, and a rate typed in by hand beats anything fetched.
 */

import { useCallback, useEffect, useState } from 'react';

export interface Currency {
  code: string;
  /** What goes in front of the figure. */
  symbol: string;
  name: string;
  /** Won and yen are not written with decimal places. */
  decimals: number;
}

/** The currencies this trip spends in, plus the one it is authored in. */
export const CURRENCIES: Currency[] = [
  { code: 'KRW', symbol: '₩', name: 'Korean won', decimals: 0 },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen', decimals: 0 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'Pound sterling', decimals: 2 },
];

export function currency(code: string): Currency | null {
  return CURRENCIES.find((c) => c.code === code) ?? null;
}

/** Units of `code` per one US dollar, and the day those rates were published. */
export interface Rates {
  per: Record<string, number>;
  /** YYYY-MM-DD, from the rate source rather than from this device's clock. */
  date: string;
}

const STORE_KEY = 'trip-planner:rates';
const SOURCE = 'https://api.frankfurter.app/latest';

/** Today where this device is, in the YYYY-MM-DD the rate source also speaks. */
function today(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function readStored(): Rates | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Rates>;
    if (!v || typeof v.date !== 'string' || !v.per || typeof v.per !== 'object') return null;
    const per: Record<string, number> = {};
    for (const [k, n] of Object.entries(v.per)) if (typeof n === 'number' && n > 0) per[k] = n;
    return Object.keys(per).length ? { per, date: v.date } : null;
  } catch {
    return null;
  }
}

function writeStored(r: Rates): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(r));
  } catch {
    /* storage blocked — the rate is just re-fetched next time */
  }
}

/**
 * The day's rates, or the last ones this device saw.
 *
 * Nothing here throws and nothing here blocks: the hook hands back whatever is
 * stored straight away, and replaces it if the network answers. A trip that
 * never gets an answer runs on the last rate it has, or on none at all, and
 * the UI says which by reading `date` against today.
 */
export function useRates(): { rates: Rates | null; stale: boolean; refresh: () => void } {
  const [rates, setRates] = useState<Rates | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const stored = readStored();
    if (stored) setRates(stored);
    // Today's rates are already in hand; don't spend a request on them.
    if (stored?.date === today() && nonce === 0) return;

    let live = true;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    (async () => {
      try {
        const symbols = CURRENCIES.map((c) => c.code).join(',');
        const res = await fetch(`${SOURCE}?base=USD&symbols=${symbols}`, { signal: ac.signal });
        if (!res.ok) return;
        const body = (await res.json()) as { date?: unknown; rates?: unknown };
        const per: Record<string, number> = {};
        for (const [k, n] of Object.entries((body.rates ?? {}) as Record<string, unknown>)) {
          if (typeof n === 'number' && n > 0) per[k] = n;
        }
        if (!live || !Object.keys(per).length) return;
        const fresh: Rates = { per, date: typeof body.date === 'string' ? body.date : today() };
        setRates(fresh);
        writeStored(fresh);
      } catch {
        /* offline, blocked, or too slow — the stored rate stands */
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      live = false;
      ac.abort();
      clearTimeout(timer);
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { rates, stale: Boolean(rates) && rates?.date !== today(), refresh };
}

/**
 * What one dollar buys, for a city's currency: the rate typed in by hand if
 * there is one, else the day's. A hand-typed rate wins because the traveler
 * has seen the rate their card actually gave them, which is not the mid-market
 * one any source publishes.
 */
export function rateFor(code: string, rates: Rates | null, override: number): number | null {
  if (override > 0) return override;
  const n = rates?.per[code];
  return typeof n === 'number' && n > 0 ? n : null;
}

/** "₩158,000" — the local figure for a dollar amount, or null without a rate. */
export function fmtLocal(usd: number, code: string, rate: number | null): string | null {
  const c = currency(code);
  if (!c || !rate || !Number.isFinite(usd)) return null;
  const v = usd * rate;
  return (
    c.symbol +
    v.toLocaleString('en-US', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals })
  );
}

/** The other direction: a price read off a menu, in dollars. */
export function toUsd(local: number, rate: number | null): number | null {
  return rate && rate > 0 && Number.isFinite(local) ? local / rate : null;
}
