'use client';

import { City } from '@/lib/data';
import { CURRENCIES, Rates, currency, fmtLocal, rateFor } from '@/lib/money';
import { label } from './fields';

/**
 * What this city spends in, and what a dollar is worth there today.
 *
 * The plan is authored in dollars throughout — that is what the two of you
 * budget in — so this does not change a single stored figure. It only says
 * what those figures come to where they will be spent.
 */
export default function CityMoney({
  city, rates, stale, onCity,
}: {
  city: City;
  rates: Rates | null;
  /** The stored rates are from a day before today. */
  stale: boolean;
  onCity: <K extends keyof City>(key: K, val: City[K]) => void;
}) {
  const cur = currency(city.currency);
  const rate = rateFor(city.currency, rates, city.rate);

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="mono" style={{ ...label, flex: 1 }}>Spends in</div>
        <select
          value={city.currency}
          aria-label={`Currency spent in ${city.name || 'this city'}`}
          onChange={(e) => onCity('currency', e.target.value)}
          style={{
            minHeight: 36, padding: '0 8px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-neutral-800)', background: 'var(--color-surface)',
            color: 'var(--color-text)', fontSize: 12.5,
          }}
        >
          <option value="">Dollars only</option>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol} {c.name}
            </option>
          ))}
        </select>
      </div>

      {cur ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
          <div className="mono" style={{ ...label, flex: 1, color: 'var(--color-neutral-600)' }}>
            {rate ? (
              <>
                $1 = <span className="num">{fmtLocal(1, cur.code, rate)}</span>
                {city.rate > 0
                  ? ' · your rate'
                  : stale && rates
                    ? ` · ${rates.date}`
                    : ' · today'}
              </>
            ) : (
              'No rate yet — type one to convert'
            )}
          </div>
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={city.rate || ''}
            placeholder={rates?.per[cur.code] ? String(Math.round(rates.per[cur.code])) : 'rate'}
            aria-label={`Your own rate, ${cur.code} per dollar`}
            onChange={(e) => onCity('rate', Number(e.target.value) || 0)}
            className="num"
            style={{
              width: 78, minHeight: 36, padding: '0 8px', textAlign: 'right', fontSize: 12.5,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
              background: 'var(--color-surface)',
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A dollar figure's local equivalent, for under the figure itself. Renders
 * nothing at all when the city spends in dollars or no rate is known, so
 * every caller can drop it in unconditionally.
 */
export function Local({
  usd, city, rates, align = 'right',
}: {
  usd: number;
  city: City | null;
  rates: Rates | null;
  align?: 'left' | 'right';
}) {
  if (!city || !city.currency || !usd) return null;
  const text = fmtLocal(usd, city.currency, rateFor(city.currency, rates, city.rate));
  if (!text) return null;
  return (
    <div
      className="mono num"
      style={{ fontSize: 9, color: 'var(--color-neutral-600)', textAlign: align, marginTop: 2 }}
    >
      {text}
    </div>
  );
}
