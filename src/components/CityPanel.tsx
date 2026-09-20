'use client';

import { useEffect, useRef, useState } from 'react';
import { LatLng, PARTY, TRANSIT } from '@/lib/data';
import { fmtUsd } from '@/lib/format';
import { eatsFor, transitLabel } from '@/lib/derive';
import { CityCfg, HotelCfg } from '@/lib/tripState';
import { geocode, hitToLatLng } from '@/lib/geocode';
import { Touch } from '@/lib/tripState';
import TouchMark, { touchStyle } from './TouchMark';

const S = {
  label: { fontSize: 9.5, color: 'var(--color-neutral-500)' } as const,
  field: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text)',
  } as const,
  icon44: {
    flex: 'none',
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as const,
};

export interface CityPanelProps {
  city: string;
  cfg: CityCfg;
  subtotal: number;
  onNights: (n: number) => void;
  onHotelSel: (i: number) => void;
  onHotelField: <K extends keyof HotelCfg>(i: number, key: K, val: HotelCfg[K]) => void;
  onCfgField: (key: 'trainName' | 'trainUrl' | 'trainCost' | 'foodPer', val: string | number) => void;
  onZoom: (ll: LatLng, zoom: number) => void;
  /** Who last changed each field of this city, by path suffix. */
  touch: (suffix: string) => Touch | undefined;
}

export default function CityPanel({
  city,
  cfg,
  subtotal,
  onNights,
  onHotelSel,
  onHotelField,
  onCfgField,
  onZoom,
  touch,
}: CityPanelProps) {
  const eats = eatsFor(city, cfg);
  const transit = TRANSIT[city];

  return (
    <div
      style={{
        margin: '6px 5px 0',
        padding: '11px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg)',
        border: '1px solid var(--color-neutral-800)',
        animation: 'fadeIn .22s ease both',
      }}
    >
      {/* Nights */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="mono" style={S.label}>Nights</div>
          <TouchMark touch={touch('nights')} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="tap"
            aria-label="One night fewer"
            onClick={() => onNights(Math.max(1, cfg.nights - 1))}
            style={{
              width: 44, height: 44, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-neutral-700)', background: 'transparent',
              color: 'var(--color-neutral-300)', fontSize: 14, cursor: 'pointer',
            }}
          >
            &minus;
          </button>
          <div className="num" style={{ minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>
            {cfg.nights}
          </div>
          <button
            className="tap"
            aria-label="One night more"
            onClick={() => onNights(Math.min(9, cfg.nights + 1))}
            style={{
              width: 44, height: 44, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-accent-600)', background: 'transparent',
              color: 'var(--color-accent-200)', fontSize: 14, cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Hotels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 7px' }}>
        <div className="mono" style={S.label}>Hotel · pick one of three</div>
        <div className="mono" style={{ ...S.label, fontSize: 9 }}>
          {fmtUsd((Number(cfg.hotels[cfg.hotelSel]?.cost) || 0) * cfg.nights)} total
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {cfg.hotels.map((h, i) => (
          <HotelCard
            key={i}
            index={i}
            hotel={h}
            nights={cfg.nights}
            selected={cfg.hotelSel === i}
            onSelect={() => {
              onHotelSel(i);
              if (h.ll) onZoom(h.ll, 16);
            }}
            onField={(key, val) => onHotelField(i, key, val)}
            touch={touch('hotel/' + i) ?? (cfg.hotelSel === i ? touch('hotelSel') : undefined)}
          />
        ))}
      </div>

      {/* Transit */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 7px' }}>
        <div className="mono" style={S.label}>{transitLabel(city)}</div>
        {cfg.trainUrl ? (
          <a
            className="mono tap"
            href={cfg.trainUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 10px',
              margin: '-10px -10px -10px 0', fontSize: 9,
              color: 'var(--color-accent-300)', textDecoration: 'none',
            }}
          >
            Open link ↗
          </a>
        ) : null}
      </div>
      <div
        style={{
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--color-neutral-800)',
          background: 'var(--color-surface)',
          padding: '2px 8px',
          ...(touchStyle(touch('trainName') ?? touch('trainCost') ?? touch('trainUrl')) ?? {}),
        }}
      >
        <input
          type="text"
          value={cfg.trainName}
          placeholder="Service (e.g. Nozomi, reserved)"
          onChange={(e) => onCfgField('trainName', e.target.value)}
          style={{ ...S.field, width: '100%' }}
        />
        <input
          type="url"
          value={cfg.trainUrl}
          placeholder="Booking link"
          onChange={(e) => onCfgField('trainUrl', e.target.value)}
          style={{
            width: '100%', height: 38, fontSize: 11,
            fontFamily: 'var(--font-mono)', color: 'var(--color-accent-300)',
            borderTop: '1px solid var(--color-neutral-900)',
          }}
        />
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 44,
            borderTop: '1px solid var(--color-neutral-900)',
          }}
        >
          <div className="mono" style={{ ...S.label, flex: 'none' }}>$ / person</div>
          <input
            type="number"
            min={0}
            value={cfg.trainCost}
            onChange={(e) => onCfgField('trainCost', Number(e.target.value))}
            className="num"
            style={{ width: 92, fontSize: 13, fontWeight: 500 }}
          />
          <div className="mono num" style={{ ...S.label, marginLeft: 'auto' }}>
            {fmtUsd((Number(cfg.trainCost) || 0) * PARTY)} for {PARTY}
          </div>
        </div>
      </div>
      {transit ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
          {transit.opts.map((o) => (
            <button
              key={o.name}
              className="tap"
              onClick={() => {
                onCfgField('trainName', o.name);
                onCfgField('trainCost', o.per);
              }}
              style={{
                minHeight: 36, padding: '0 12px', borderRadius: 9999,
                border: '1px solid var(--color-neutral-700)', background: 'transparent',
                color: 'var(--color-neutral-300)', fontSize: 11.5, cursor: 'pointer',
              }}
              title={o.note}
            >
              {o.name} · {fmtUsd(o.per)}
            </button>
          ))}
        </div>
      ) : null}

      {/* Eating */}
      {eats.length ? (
        <>
          <div className="mono" style={{ ...S.label, margin: '14px 0 7px' }}>Eating here</div>
          <div style={{ display: 'flex', gap: 7 }}>
            {eats.map((e) => (
              <button
                key={e.name}
                className="tap"
                onClick={() => onZoom(e.ll, 16.5)}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', padding: 9, cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
                  background: 'var(--color-surface)', color: 'inherit',
                }}
              >
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500 }}>{e.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--color-accent-300)' }}>{e.band}</span>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--color-neutral-500)' }}>{e.note}</span>
                <span
                  className="mono"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, marginTop: 6,
                    fontSize: 9, color: 'var(--color-accent-300)',
                  }}
                >
                  <i className="ph ph-person-simple-walk" style={{ fontSize: 11 }} />
                  {e.walk}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* Food slider */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 4px' }}>
        <div>
          <div className="mono" style={S.label}>Food, per day</div>
          <TouchMark touch={touch('foodPer')} />
        </div>
        <div className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-accent-300)' }}>
          {fmtUsd(cfg.foodPer)}/day
        </div>
      </div>
      <input
        type="range"
        min={10}
        max={200}
        step={5}
        value={cfg.foodPer}
        aria-label="Food budget per day"
        onChange={(e) => onCfgField('foodPer', Number(e.target.value))}
        style={{ width: '100%', height: 32, accentColor: '#9184d9' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="mono" style={{ ...S.label, fontSize: 9, color: 'var(--color-neutral-600)' }}>$10</div>
        <div className="mono num" style={{ ...S.label, fontSize: 9 }}>
          {fmtUsd(cfg.foodPer * cfg.nights)} over {cfg.nights} days
        </div>
        <div className="mono" style={{ ...S.label, fontSize: 9, color: 'var(--color-neutral-600)' }}>$200</div>
      </div>

      {/* Subtotal */}
      <div style={{ borderTop: '1px solid var(--color-divider)', margin: '12px 0 9px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>{city} subtotal</div>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent-200)' }}>
          {fmtUsd(subtotal)}
        </div>
      </div>
    </div>
  );
}

function HotelCard({
  index,
  hotel,
  nights,
  selected,
  onSelect,
  onField,
  touch,
}: {
  index: number;
  hotel: HotelCfg;
  nights: number;
  selected: boolean;
  onSelect: () => void;
  onField: <K extends keyof HotelCfg>(key: K, val: HotelCfg[K]) => void;
  touch?: Touch;
}) {
  const [status, setStatus] = useState<'idle' | 'looking' | 'found' | 'missing'>('idle');
  const typed = useRef(hotel.addr);

  // A typed address is only useful once it has coordinates — resolve it so the
  // pin, the camera and the walking times all reflect the real location.
  useEffect(() => {
    if (hotel.addr === typed.current) return;
    typed.current = hotel.addr;
    const q = hotel.addr.trim();
    if (q.length < 6) {
      setStatus('idle');
      return;
    }
    let live = true;
    setStatus('looking');
    const t = setTimeout(async () => {
      const hit = await geocode(q);
      if (!live) return;
      if (hit) {
        onField('ll', hitToLatLng(hit));
        setStatus('found');
      } else {
        setStatus('missing');
      }
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [hotel.addr, onField]);

  return (
    <div
      style={{
        borderRadius: 'var(--radius-sm)',
        border: '1px solid ' + (selected ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
        background: selected ? 'rgba(145,132,217,.10)' : 'var(--color-bg)',
        transition: 'background-color .16s ease, border-color .16s ease',
        ...(touchStyle(touch) ?? {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px' }}>
        <button
          className="tap"
          role="radio"
          aria-checked={selected}
          aria-label={'Select option ' + (index + 1)}
          onClick={onSelect}
          style={{ ...S.icon44, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          <span
            style={{
              width: 15, height: 15, borderRadius: 9999,
              border: '1px solid ' + (selected ? 'var(--color-accent-400)' : 'var(--color-neutral-600)'),
              background: selected ? 'var(--color-accent-400)' : 'transparent',
            }}
          />
        </button>
        <span style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={hotel.name}
            placeholder={'Option ' + (index + 1)}
            onChange={(e) => onField('name', e.target.value)}
            style={{ ...S.field, width: '100%', height: 30 }}
          />
          <TouchMark touch={touch} />
        </span>
        {hotel.url ? (
          <a
            className="mono tap"
            href={hotel.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open booking link"
            style={{ ...S.icon44, fontSize: 13, color: 'var(--color-accent-300)', textDecoration: 'none' }}
          >
            ↗
          </a>
        ) : null}
      </div>

      {selected ? (
        <div style={{ padding: '0 8px 8px' }}>
          <input
            type="url"
            value={hotel.url}
            placeholder="Booking link"
            onChange={(e) => onField('url', e.target.value)}
            style={{
              width: '100%', height: 38, fontSize: 11,
              fontFamily: 'var(--font-mono)', color: 'var(--color-accent-300)',
            }}
          />
          <input
            type="text"
            value={hotel.addr}
            placeholder="Address"
            onChange={(e) => onField('addr', e.target.value)}
            style={{ width: '100%', height: 38, fontSize: 12 }}
          />
          <div className="mono" style={{ fontSize: 9, minHeight: 12, color: 'var(--color-neutral-600)' }}>
            {status === 'looking' ? 'Locating…' : null}
            {status === 'found' ? 'Pinned from address' : null}
            {status === 'missing' ? 'No match — pin unchanged' : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44 }}>
            <div className="mono" style={{ ...S.label, flex: 'none' }}>$ / night</div>
            <input
              type="number"
              min={0}
              value={hotel.cost}
              onChange={(e) => onField('cost', Number(e.target.value))}
              className="num"
              style={{ width: 92, fontSize: 13, fontWeight: 500 }}
            />
            <div className="mono num" style={{ ...S.label, marginLeft: 'auto' }}>
              {fmtUsd((Number(hotel.cost) || 0) * nights)} total
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
