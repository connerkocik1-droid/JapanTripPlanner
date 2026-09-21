'use client';

import { useState } from 'react';
import { City, Hotel, LatLng } from '@/lib/data';
import { fmtUsd, money } from '@/lib/format';
import { Touch } from '@/lib/tripState';
import TouchMark, { touchStyle } from './TouchMark';
import { GeoStatus, NumField, ghostBtn, label, useGeocodedAddress } from './fields';

export interface StayTabProps {
  cities: City[];
  /** Nothing is active until someone presses the button on an option. */
  onSetActive: (cityId: string, hotelId: string | null) => void;
  onHotel: <K extends keyof Hotel>(cityId: string, hotelId: string, key: K, val: Hotel[K]) => void;
  onAddHotel: (cityId: string) => void;
  onZoom: (ll: LatLng, zoom: number) => void;
  touch: (path: string) => Touch | undefined;
}

/**
 * Lodging lives here rather than in the map's bottom sheet: the options are all
 * loaded in side by side, and one of them is made active with a button — that
 * is the one the budget counts and the one the map marks brightest.
 */
export default function StayTab({
  cities, onSetActive, onHotel, onAddHotel, onZoom, touch,
}: StayTabProps) {
  if (cities.length === 0) {
    return (
      <div
        style={{
          padding: '22px 16px', borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--color-neutral-800)', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 500 }}>No cities yet</div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', margin: '6px 0 2px', lineHeight: 1.5 }}>
          Add a city on the Map tab and its hotel options show up here.
        </div>
      </div>
    );
  }

  return (
    <>
      {cities.map((city) => {
        const active = city.hotels.find((h) => h.id === city.hotelSel) ?? null;
        return (
          <div key={city.id} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 8, margin: '0 2px 7px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500 }}>{city.name}</div>
                <div className="mono" style={{ ...label, fontSize: 9 }}>
                  {city.nights} {city.nights === 1 ? 'night' : 'nights'} ·{' '}
                  {city.hotels.filter((h) => h.name.trim()).length || 'no'} options
                </div>
              </div>
              <div className="mono num" style={{ ...label, fontSize: 9, textAlign: 'right', flex: 'none' }}>
                {active
                  ? fmtUsd((Number(active.cost) || 0) * city.nights) + ' total'
                  : 'none active'}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 7 }}>
              {city.hotels.map((h, i) => (
                <StayCard
                  key={h.id}
                  index={i}
                  hotel={h}
                  nights={city.nights}
                  active={city.hotelSel === h.id}
                  onToggle={() => {
                    const turningOn = city.hotelSel !== h.id;
                    onSetActive(city.id, turningOn ? h.id : null);
                    if (turningOn && h.ll) onZoom(h.ll, 16);
                  }}
                  onShow={() => h.ll && onZoom(h.ll, 16)}
                  onField={(key, val) => onHotel(city.id, h.id, key, val)}
                  touch={
                    touch(`${city.id}/hotel/${h.id}`) ??
                    (city.hotelSel === h.id ? touch(`${city.id}/hotelSel`) : undefined)
                  }
                />
              ))}
            </div>

            <button className="tap" onClick={() => onAddHotel(city.id)} style={ghostBtn}>
              <i className="ph ph-plus" style={{ fontSize: 12 }} /> Another option in {city.name}
            </button>
          </div>
        );
      })}
    </>
  );
}

function StayCard({
  index, hotel, nights, active, onToggle, onShow, onField, touch,
}: {
  index: number;
  hotel: Hotel;
  nights: number;
  active: boolean;
  onToggle: () => void;
  onShow: () => void;
  onField: <K extends keyof Hotel>(key: K, val: Hotel[K]) => void;
  touch?: Touch;
}) {
  const [open, setOpen] = useState(false);
  const status = useGeocodedAddress(hotel.addr, (ll) => onField('ll', ll));
  const nightly = Number(hotel.cost) || 0;
  const shots = (hotel.images ?? []).filter((s) => s.trim());

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid ' + (active ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
        background: active ? 'rgba(145,132,217,.10)' : 'var(--color-surface)',
        transition: 'background-color .16s ease, border-color .16s ease',
        ...(touchStyle(touch) ?? {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px 3px' }}>
        <span
          aria-hidden
          style={{
            flex: 'none', width: 26, height: 26, borderRadius: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            color: active ? '#241f3d' : 'var(--color-accent-200)',
            background: active ? 'var(--color-accent-400)' : 'var(--color-accent-800)',
          }}
        >
          <i className="ph ph-bed" />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            value={hotel.name}
            placeholder={'Option ' + (index + 1)}
            onChange={(e) => onField('name', e.target.value)}
            style={{ width: '100%', height: 30, fontSize: 13.5, fontWeight: 500 }}
          />
          <TouchMark touch={touch} />
        </span>
        <span className="num" style={{ flex: 'none', textAlign: 'right' }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{money(nightly)}</span>
          <span className="mono" style={{ ...label, fontSize: 8 }}>per night</span>
        </span>
        <button
          className="tap"
          aria-expanded={open}
          aria-label={open ? 'Hide details' : 'Edit details'}
          onClick={() => setOpen((v) => !v)}
          style={{
            flex: 'none', width: 34, height: 34, border: 'none', background: 'none',
            color: 'var(--color-neutral-500)', fontSize: 13, cursor: 'pointer',
          }}
        >
          <i className={open ? 'ph ph-caret-up' : 'ph ph-caret-down'} />
        </button>
      </div>

      {shots.length ? (
        <div className="stay-shots">
          {shots.map((src, i) => (
            // A dead URL shouldn't leave a broken-image box in the list.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src + i}
              src={src}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ))}
        </div>
      ) : null}

      {hotel.overview.trim() && !open ? (
        <p className="stay-note">{hotel.overview.trim()}</p>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 8px' }}>
        <button
          className="tap"
          aria-pressed={active}
          onClick={onToggle}
          style={{
            flex: 1, minHeight: 40, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: '1px solid ' + (active ? 'var(--color-accent-400)' : 'var(--color-neutral-700)'),
            background: active ? 'var(--color-accent-400)' : 'transparent',
            color: active ? '#241f3d' : 'var(--color-neutral-300)',
            fontSize: 12, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <i className={active ? 'ph-fill ph-check-circle' : 'ph ph-circle'} style={{ fontSize: 14 }} />
          {active ? 'Active' : 'Set active'}
        </button>
        {hotel.ll ? (
          <button
            className="tap"
            onClick={onShow}
            aria-label="Show on the map"
            style={{
              flex: 'none', width: 40, minHeight: 40, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-neutral-800)', background: 'transparent',
              color: 'var(--color-accent-200)', fontSize: 14, cursor: 'pointer',
            }}
          >
            <i className="ph ph-map-pin" />
          </button>
        ) : null}
        {hotel.url ? (
          <a
            className="tap"
            href={hotel.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open booking link"
            style={{
              flex: 'none', width: 40, minHeight: 40, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-neutral-800)',
              color: 'var(--color-accent-300)', fontSize: 13, textDecoration: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ↗
          </a>
        ) : null}
      </div>

      {open ? (
        <div style={{ padding: '0 8px 9px' }}>
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
            <NumField value={hotel.cost} onChange={(v) => onField('cost', v)} aria="Cost per night" />
            <div className="mono num" style={{ ...label, marginLeft: 'auto' }}>
              {fmtUsd(nightly * nights)} for {nights} {nights === 1 ? 'night' : 'nights'}
            </div>
          </div>

          <div className="mono" style={{ ...label, marginTop: 4 }}>Overview</div>
          <textarea
            value={hotel.overview}
            placeholder="Rooms, location, breakfast — whatever you want to remember."
            onChange={(e) => onField('overview', e.target.value)}
            rows={3}
            style={{
              width: '100%', marginTop: 3, resize: 'vertical', background: 'transparent',
              border: '1px solid var(--color-neutral-800)', borderRadius: 'var(--radius-sm)',
              padding: '6px 7px', outline: 'none', color: 'var(--color-text)',
              fontSize: 12, lineHeight: 1.45,
            }}
          />

          <div className="mono" style={{ ...label, marginTop: 8 }}>Photos · one URL per line</div>
          <textarea
            // Kept unfiltered while typing so a fresh newline survives the
            // round trip; the blanks are dropped on blur and never rendered.
            value={(hotel.images ?? []).join('\n')}
            placeholder="https://…/room.jpg"
            onChange={(e) => onField('images', e.target.value.split('\n'))}
            onBlur={() => onField('images', (hotel.images ?? []).map((s) => s.trim()).filter(Boolean))}
            rows={2}
            style={{
              width: '100%', marginTop: 3, resize: 'vertical', background: 'transparent',
              border: '1px solid var(--color-neutral-800)', borderRadius: 'var(--radius-sm)',
              padding: '6px 7px', outline: 'none', color: 'var(--color-accent-300)',
              fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.5,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
