'use client';

import { useEffect, useRef, useState } from 'react';
import { City, Hotel, LatLng, MAX_NIGHTS, PLACE_KINDS, Place } from '@/lib/data';
import { fmtUsd, walkLabel } from '@/lib/format';
import { CitySpend } from '@/lib/derive';
import { geocode, hitToLatLng } from '@/lib/geocode';
import { isFlightLeg } from '@/lib/legKind';
import { Touch } from '@/lib/tripState';
import TouchMark, { touchStyle } from './TouchMark';

const label = { fontSize: 9.5, color: 'var(--color-neutral-500)' } as const;
const boxed = {
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-surface)',
} as const;

export interface CityPanelProps {
  city: City;
  spend: CitySpend;
  travelers: number;
  onCity: <K extends keyof City>(key: K, val: City[K]) => void;
  onHotel: <K extends keyof Hotel>(hotelId: string, key: K, val: Hotel[K]) => void;
  onAddHotel: () => void;
  onAddPlace: () => void;
  onPlace: <K extends keyof Place>(placeId: string, key: K, val: Place[K]) => void;
  onRemovePlace: (placeId: string) => void;
  onZoom: (ll: LatLng, zoom: number) => void;
  touch: (suffix: string) => Touch | undefined;
}

export default function CityPanel({
  city, spend, travelers, onCity, onHotel, onAddHotel,
  onAddPlace, onPlace, onRemovePlace, onZoom, touch,
}: CityPanelProps) {
  const chosen = city.hotels.find((h) => h.id === city.hotelSel) ?? null;
  // A flown leg carries a flight number and an arrival time instead of a route.
  const flight = isFlightLeg(city.transitName);

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
          <div className="mono" style={label}>Nights</div>
          <TouchMark touch={touch('nights')} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="tap"
            aria-label="One night fewer"
            onClick={() => onCity('nights', Math.max(1, city.nights - 1))}
            style={stepper('var(--color-neutral-700)', 'var(--color-neutral-300)')}
          >
            &minus;
          </button>
          <div className="num" style={{ minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>
            {city.nights}
          </div>
          <button
            className="tap"
            aria-label="One night more"
            onClick={() => onCity('nights', Math.min(MAX_NIGHTS, city.nights + 1))}
            style={stepper('var(--color-accent-600)', 'var(--color-accent-200)')}
          >
            +
          </button>
        </div>
      </div>

      {/* Hotels — one of these feeds the budget */}
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 7px' }}>
        <div className="mono" style={label}>
          Hotel · {city.hotelSel ? 'selected one counts' : 'pick one to budget'}
        </div>
        <div className="mono num" style={{ ...label, fontSize: 9 }}>
          {chosen ? fmtUsd((Number(chosen.cost) || 0) * city.nights) + ' total' : '—'}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {city.hotels.map((h, i) => (
          <HotelCard
            key={h.id}
            index={i}
            hotel={h}
            nights={city.nights}
            selected={city.hotelSel === h.id}
            onSelect={() => {
              onCity('hotelSel', h.id);
              if (h.ll) onZoom(h.ll, 16);
            }}
            onField={(key, val) => onHotel(h.id, key, val)}
            touch={touch('hotel/' + h.id) ?? (city.hotelSel === h.id ? touch('hotelSel') : undefined)}
          />
        ))}
      </div>
      <button className="tap" onClick={onAddHotel} style={ghostBtn}>
        <i className="ph ph-plus" style={{ fontSize: 12 }} /> Another option
      </button>

      {/* Transit */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 7px' }}>
        <div>
          <div className="mono" style={label}>Getting to {city.name}</div>
          <TouchMark touch={touch('transitName') ?? touch('transitCost') ?? touch('flightNo')} />
        </div>
        {city.transitUrl ? (
          <a
            className="mono tap"
            href={city.transitUrl}
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
          ...boxed,
          padding: '2px 8px',
          ...(touchStyle(
            touch('transitName') ?? touch('transitCost') ?? touch('transitUrl')
            ?? touch('flightNo') ?? touch('arriveAt'),
          ) ?? {}),
        }}
      >
        <input
          type="text"
          value={city.transitName}
          placeholder="Flight, train or bus"
          onChange={(e) => onCity('transitName', e.target.value)}
          style={{ width: '100%', height: 40, fontSize: 13, fontWeight: 500 }}
        />
        {flight ? (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 44,
              borderTop: '1px solid var(--color-neutral-900)',
            }}
          >
            <input
              type="text"
              value={city.flightNo ?? ''}
              placeholder="Flight no."
              aria-label={`Flight number to ${city.name}`}
              onChange={(e) => onCity('flightNo', e.target.value)}
              style={{
                flex: 1, minWidth: 0, height: 42, fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
            />
            <div className="mono" style={{ ...label, flex: 'none' }}>Arrives</div>
            <input
              type="time"
              value={city.arriveAt ?? ''}
              aria-label={`Arrival time in ${city.name}`}
              onChange={(e) => onCity('arriveAt', e.target.value)}
              style={{
                flex: 'none', width: 96, height: 42, fontSize: 12,
                fontFamily: 'var(--font-mono)', color: 'var(--color-neutral-300)',
              }}
            />
          </div>
        ) : null}
        <input
          type="url"
          value={city.transitUrl}
          placeholder="Booking link"
          onChange={(e) => onCity('transitUrl', e.target.value)}
          style={{
            width: '100%', height: 38, fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--color-accent-300)', borderTop: '1px solid var(--color-neutral-900)',
          }}
        />
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: 44,
            borderTop: '1px solid var(--color-neutral-900)',
          }}
        >
          <div className="mono" style={{ ...label, flex: 'none' }}>$ / person</div>
          <NumField
            value={city.transitCost}
            onChange={(v) => onCity('transitCost', v)}
            aria="Transit cost per person"
          />
          <div className="mono num" style={{ ...label, marginLeft: 'auto' }}>
            {fmtUsd((Number(city.transitCost) || 0) * travelers)} for {travelers}
          </div>
        </div>
      </div>

      {/* Places */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 7px' }}>
        <div className="mono" style={label}>Places here</div>
        <TouchMark touch={touch('places')} align="right" />
      </div>
      {city.places.length === 0 ? (
        <div style={{ ...emptyNote }}>
          Restaurants, sights, anything worth pinning. They show on the map right
          away; routes come once you put them in a day.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {city.places.map((p) => (
            <PlaceCard
              key={p.id}
              place={p}
              from={chosen?.ll ?? city.ll}
              onField={(key, val) => onPlace(p.id, key, val)}
              onRemove={() => onRemovePlace(p.id)}
              onZoom={() => p.ll && onZoom(p.ll, 16.5)}
              touch={touch('place/' + p.id)}
            />
          ))}
        </div>
      )}
      <button className="tap" onClick={onAddPlace} style={ghostBtn}>
        <i className="ph ph-plus" style={{ fontSize: 12 }} /> Add a place
      </button>

      {/* Food slider */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 4px' }}>
        <div>
          <div className="mono" style={label}>Food, per day</div>
          <TouchMark touch={touch('foodPer')} />
        </div>
        <div className="num" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-accent-300)' }}>
          {city.foodPer ? fmtUsd(city.foodPer) + '/day' : 'not set'}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={300}
        step={5}
        value={city.foodPer}
        aria-label="Food budget per day"
        onChange={(e) => onCity('foodPer', Number(e.target.value))}
        style={{ width: '100%', height: 32, accentColor: '#9184d9' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="mono" style={{ ...label, fontSize: 9, color: 'var(--color-neutral-600)' }}>$0</div>
        <div className="mono num" style={{ ...label, fontSize: 9 }}>
          {fmtUsd(city.foodPer * city.nights)} over {city.nights} {city.nights === 1 ? 'day' : 'days'}
        </div>
        <div className="mono" style={{ ...label, fontSize: 9, color: 'var(--color-neutral-600)' }}>$300</div>
      </div>

      {/* Subtotal */}
      <div style={{ borderTop: '1px solid var(--color-divider)', margin: '12px 0 9px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>{city.name} subtotal</div>
        <div className="num" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent-200)' }}>
          {fmtUsd(spend.total)}
        </div>
      </div>
      {spend.activities ? (
        <div className="mono num" style={{ ...label, fontSize: 9, textAlign: 'right', marginTop: 3 }}>
          plus {fmtUsd(spend.activities)} of planned items
        </div>
      ) : null}
    </div>
  );
}

const emptyNote = {
  padding: '12px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px dashed var(--color-neutral-800)',
  color: 'var(--color-neutral-600)',
  fontSize: 11.5,
  textAlign: 'center' as const,
};

const ghostBtn = {
  width: '100%',
  minHeight: 40,
  marginTop: 6,
  borderRadius: 'var(--radius-sm)',
  border: '1px dashed var(--color-neutral-700)',
  background: 'transparent',
  color: 'var(--color-accent-200)',
  fontSize: 11.5,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  cursor: 'pointer',
};

function stepper(border: string, color: string) {
  return {
    width: 44, height: 44, borderRadius: 'var(--radius-sm)',
    border: '1px solid ' + border, background: 'transparent',
    color, fontSize: 14, cursor: 'pointer',
  } as const;
}

/** A number input that can be cleared instead of snapping back to 0. */
function NumField({
  value, onChange, aria, width = 92,
}: { value: number; onChange: (v: number) => void; aria: string; width?: number }) {
  const [text, setText] = useState(value ? String(value) : '');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value ? String(value) : '');
    }
  }, [value]);
  return (
    <input
      type="number"
      min={0}
      inputMode="decimal"
      aria-label={aria}
      value={text}
      placeholder="0"
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        last.current = Number.isFinite(n) ? n : 0;
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className="num"
      style={{ width, fontSize: 13, fontWeight: 500 }}
    />
  );
}

/** Resolves a typed address to coordinates so the pin and walk times are real. */
function useGeocodedAddress(addr: string, onResolved: (ll: LatLng) => void) {
  const [status, setStatus] = useState<'idle' | 'looking' | 'found' | 'missing'>('idle');
  const typed = useRef(addr);
  // Held in a ref: the caller passes a fresh closure every render, and putting
  // that in the dependency list would clear the debounce timer before it fires.
  const cb = useRef(onResolved);
  cb.current = onResolved;
  useEffect(() => {
    if (addr === typed.current) return;
    typed.current = addr;
    const q = addr.trim();
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
        cb.current(hitToLatLng(hit));
        setStatus('found');
      } else {
        setStatus('missing');
      }
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [addr]);
  return status;
}

function GeoStatus({ status }: { status: 'idle' | 'looking' | 'found' | 'missing' }) {
  return (
    <div className="mono" style={{ fontSize: 9, minHeight: 12, color: 'var(--color-neutral-600)' }}>
      {status === 'looking' ? 'Locating…' : null}
      {status === 'found' ? 'Pinned from address' : null}
      {status === 'missing' ? 'No match — pin unchanged' : null}
    </div>
  );
}

function HotelCard({
  index, hotel, nights, selected, onSelect, onField, touch,
}: {
  index: number;
  hotel: Hotel;
  nights: number;
  selected: boolean;
  onSelect: () => void;
  onField: <K extends keyof Hotel>(key: K, val: Hotel[K]) => void;
  touch?: Touch;
}) {
  const status = useGeocodedAddress(hotel.addr, (ll) => onField('ll', ll));
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
          aria-label={'Use option ' + (index + 1) + ' in the budget'}
          onClick={onSelect}
          style={{
            flex: 'none', width: 44, height: 44, background: 'none', border: 'none',
            padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
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
            style={{ width: '100%', height: 30, fontSize: 13, fontWeight: 500 }}
          />
          <TouchMark touch={touch} />
        </span>
        <span className="num" style={{ fontSize: 11, color: 'var(--color-neutral-500)', flex: 'none' }}>
          {hotel.cost ? fmtUsd(hotel.cost) + '/night' : ''}
        </span>
        {hotel.url ? (
          <a
            className="mono tap"
            href={hotel.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open booking link"
            style={{
              flex: 'none', width: 44, height: 44, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 13, color: 'var(--color-accent-300)', textDecoration: 'none',
            }}
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
          <GeoStatus status={status} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44 }}>
            <div className="mono" style={{ ...label, flex: 'none' }}>$ / night</div>
            <NumField
              value={hotel.cost}
              onChange={(v) => onField('cost', v)}
              aria="Cost per night"
            />
            <div className="mono num" style={{ ...label, marginLeft: 'auto' }}>
              {fmtUsd((Number(hotel.cost) || 0) * nights)} total
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlaceCard({
  place, from, onField, onRemove, onZoom, touch,
}: {
  place: Place;
  from: LatLng | null;
  onField: <K extends keyof Place>(key: K, val: Place[K]) => void;
  onRemove: () => void;
  onZoom: () => void;
  touch?: Touch;
}) {
  const status = useGeocodedAddress(place.addr, (ll) => onField('ll', ll));
  const walk = walkLabel(from, place.ll);
  return (
    <div style={{ ...boxed, padding: '4px 8px 8px', ...(touchStyle(touch) ?? {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select
          value={place.kind}
          aria-label="Kind of place"
          onChange={(e) => onField('kind', e.target.value as Place['kind'])}
          style={{
            flex: 'none', width: 58, height: 34, fontSize: 11, padding: '0 4px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
            background: 'var(--color-bg)', color: 'var(--color-accent-200)',
          }}
        >
          {PLACE_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={place.name}
          placeholder="Name"
          onChange={(e) => onField('name', e.target.value)}
          style={{ flex: 1, minWidth: 0, height: 38, fontSize: 12.5, fontWeight: 500 }}
        />
        <input
          type="text"
          value={place.band}
          placeholder="$$"
          onChange={(e) => onField('band', e.target.value)}
          style={{ width: 44, height: 38, fontSize: 11.5, color: 'var(--color-accent-300)' }}
        />
        <button
          className="tap"
          onClick={onZoom}
          disabled={!place.ll}
          aria-label="Show on map"
          style={{
            width: 34, height: 34, borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'transparent', cursor: place.ll ? 'pointer' : 'default',
            color: place.ll ? 'var(--color-accent-300)' : 'var(--color-neutral-800)',
          }}
        >
          <i className="ph ph-map-pin" style={{ fontSize: 14 }} />
        </button>
        <button
          className="tap"
          onClick={onRemove}
          aria-label="Remove place"
          style={{
            width: 34, height: 34, borderRadius: 'var(--radius-sm)', border: 'none',
            background: 'transparent', color: 'var(--color-neutral-700)', cursor: 'pointer',
          }}
        >
          <i className="ph ph-trash" style={{ fontSize: 13 }} />
        </button>
      </div>
      <input
        type="text"
        value={place.addr}
        placeholder="Address"
        onChange={(e) => onField('addr', e.target.value)}
        style={{ width: '100%', height: 34, fontSize: 11.5 }}
      />
      <input
        type="text"
        value={place.note}
        placeholder="Note"
        onChange={(e) => onField('note', e.target.value)}
        style={{ width: '100%', height: 32, fontSize: 11, color: 'var(--color-neutral-400)' }}
      />
      {walk ? (
        <span
          className="mono"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--color-accent-300)' }}
        >
          <i className="ph ph-person-simple-walk" style={{ fontSize: 11 }} />
          {walk}
        </span>
      ) : (
        <GeoStatus status={status} />
      )}
    </div>
  );
}
