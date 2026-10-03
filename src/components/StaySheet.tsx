'use client';

import { ReactNode, useState } from 'react';
import { City, Hotel } from '@/lib/data';
import { fmtUsd } from '@/lib/format';
import { splitTier } from '@/lib/hotelTier';
import { Local } from './CityMoney';
import type { Rates } from '@/lib/money';

/**
 * The other places you could stay in this city, over the plan.
 *
 * The Plan timeline shows one hotel per city — the one the budget counts —
 * because that is what the trip actually is. The shortlist is still worth a
 * look while reading the plan, so it slides up over it rather than sending you
 * to another tab and losing your place. It compares and switches; filling the
 * options in is folded away behind one button, so the sheet opens on the
 * comparison rather than on a form.
 */
export default function StaySheet({
  city, rates, editor, onSetActive, onClose,
}: {
  city: City;
  rates: Rates | null;
  /** The editor for this city's options, folded away until it is asked for. */
  editor?: ReactNode;
  onSetActive: (hotelId: string | null) => void;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const filled = (h: Hotel) =>
    Boolean(h.name.trim() || h.cost || h.addr.trim() || h.url.trim());
  const options = city.hotels.filter((h) => filled(h) || h.id === city.hotelSel);

  return (
    <div
      role="dialog"
      aria-label={'Where to stay in ' + city.name}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      {/* The plan stays visible behind it, which is the point of a sheet. */}
      <button
        aria-label="Close"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, border: 'none', cursor: 'pointer',
          background: 'color-mix(in srgb, var(--color-text) 28%, transparent)',
        }}
      />
      <div
        style={{
          position: 'relative', maxHeight: '78vh', overflowY: 'auto',
          background: 'var(--color-raised)',
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          borderTop: '1px solid var(--color-neutral-800)',
          boxShadow: 'var(--shadow-card)',
          padding: '12px 14px calc(var(--safe-bottom) + 16px)',
          animation: 'riseIn .22s ease both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 500 }}>Where to stay in {city.name}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
              {city.nights} {city.nights === 1 ? 'NIGHT' : 'NIGHTS'} · {options.length || 'NO'}{' '}
              {options.length === 1 ? 'OPTION' : 'OPTIONS'}
            </div>
          </div>
          <button
            className="tap"
            onClick={onClose}
            aria-label="Close"
            style={{
              flex: 'none', width: 34, height: 34, borderRadius: 9999, cursor: 'pointer',
              border: '1px solid var(--color-neutral-800)', background: 'transparent',
              color: 'var(--color-neutral-500)', fontSize: 13,
            }}
          >
            <i className="ph ph-x" />
          </button>
        </div>

        {/* The editor draws every option itself, so comparing and editing do
            not stack the same list twice. */}
        {open ? null : options.length === 0 ? (
          <div
            style={{
              padding: '18px 14px', borderRadius: 'var(--radius-md)', textAlign: 'center',
              border: '1px dashed var(--color-neutral-800)', fontSize: 12,
              color: 'var(--color-neutral-500)',
            }}
          >
            No options for {city.name} yet. &ldquo;Edit these options&rdquo; below adds the first one.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {options.map((h, i) => (
              <Option
                key={h.id}
                hotel={h}
                index={i}
                city={city}
                rates={rates}
                active={h.id === city.hotelSel}
                onToggle={() => onSetActive(h.id === city.hotelSel ? null : h.id)}
              />
            ))}
          </div>
        )}

        {editor ? (
          <>
            <button
              className="tap"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              style={{
                width: '100%', minHeight: 38, marginTop: 9, borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-neutral-800)', background: 'transparent',
                color: 'var(--color-neutral-400)', fontSize: 11.5, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <i className={open ? 'ph ph-caret-up' : 'ph ph-pencil-simple'} style={{ fontSize: 12 }} />
              {open ? 'Done editing' : 'Edit these options'}
            </button>
            {open ? <div style={{ marginTop: 8 }}>{editor}</div> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Option({
  hotel, index, city, rates, active, onToggle,
}: {
  hotel: Hotel;
  index: number;
  city: City;
  rates: Rates | null;
  active: boolean;
  onToggle: () => void;
}) {
  const named = splitTier(hotel.name);
  const nightly = Number(hotel.cost) || 0;
  const total = nightly * city.nights;
  const shot = (hotel.images ?? []).find((s) => s.trim());

  return (
    <div
      style={{
        display: 'flex', gap: 10, padding: 9, borderRadius: 'var(--radius-md)',
        border: '1px solid ' + (active ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
        background: active ? 'var(--tint-accent)' : 'var(--color-surface)',
      }}
    >
      {shot ? (
        // A dead URL shouldn't leave a broken-image box in the sheet.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shot}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
          style={{
            flex: 'none', width: 62, height: 62, objectFit: 'cover',
            borderRadius: 'var(--radius-sm)',
          }}
        />
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500 }}>
            {named.name || 'Option ' + (index + 1)}
            {named.tier ? <span className="mono hc-tier">{named.tier}</span> : null}
          </span>
          <span className="num" style={{ flex: 'none', fontSize: 13, fontWeight: 600 }}>
            {nightly ? fmtUsd(nightly) : '—'}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
          {nightly
            ? fmtUsd(total) + ' FOR ' + city.nights + (city.nights === 1 ? ' NIGHT' : ' NIGHTS')
            : 'NO PRICE YET'}
        </div>
        <Local usd={total} city={city} rates={rates} align="left" />
        {hotel.overview.trim() ? (
          <p
            style={{
              margin: '4px 0 0', fontSize: 11, lineHeight: 1.45,
              color: 'var(--color-neutral-400)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {hotel.overview.trim()}
          </p>
        ) : null}
        <button
          className="tap"
          aria-pressed={active}
          onClick={onToggle}
          style={{
            marginTop: 7, minHeight: 32, width: '100%', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
            border: '1px solid ' + (active ? 'var(--color-accent-400)' : 'var(--color-neutral-700)'),
            background: active ? 'var(--color-accent-400)' : 'transparent',
            color: active ? 'var(--color-on-accent)' : 'var(--color-neutral-300)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <i className={active ? 'ph-fill ph-check-circle' : 'ph ph-circle'} style={{ fontSize: 13 }} />
          {active ? 'The one you are counting' : 'Count this one instead'}
        </button>
      </div>
    </div>
  );
}
