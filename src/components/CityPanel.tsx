'use client';

import { useState } from 'react';
import { City, LatLng, MAX_NIGHTS, PLACE_KINDS, Place, placeKind } from '@/lib/data';
import { fmtUsd, walkLabel } from '@/lib/format';
import { CitySpend } from '@/lib/derive';
import { isFlightLeg } from '@/lib/legKind';
import { Touch } from '@/lib/tripState';
import AirportRoutes from './AirportRoutes';
import AddPlace from './AddPlace';
import PlacePacks from './PlacePacks';
import TouchMark, { touchStyle } from './TouchMark';
import { GeoStatus, NumField, boxed, label, useGeocodedAddress } from './fields';

export interface CityPanelProps {
  city: City;
  spend: CitySpend;
  travelers: number;
  onCity: <K extends keyof City>(key: K, val: City[K]) => void;
  /** Switches to the Stay tab, where the lodging options live. */
  onOpenStay: () => void;
  /** Pin a ready-made list; returns the ones that were not already there. */
  onAddPlaces: (places: Place[]) => Place[];
  onPlace: <K extends keyof Place>(placeId: string, key: K, val: Place[K]) => void;
  onRemovePlace: (placeId: string) => void;
  onZoom: (ll: LatLng, zoom: number) => void;
  touch: (suffix: string) => Touch | undefined;
}

export default function CityPanel({
  city, spend, travelers, onCity, onOpenStay,
  onAddPlaces, onPlace, onRemovePlace, onZoom, touch,
}: CityPanelProps) {
  const active = city.hotels.find((h) => h.id === city.hotelSel) ?? null;
  const options = city.hotels.filter((h) => h.name.trim()).length;
  // A flown leg carries a flight number and an arrival time instead of a route.
  const flight = isFlightLeg(city.transitName);
  // Nothing pinned yet, so the shortlists are worth opening rather than offering.
  const bare = city.places.length === 0;

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

      {/*
        The shortlists sit here, above the stay, and stay here. Down in the
        places section they were a screen and a half below the fold, under the
        hotel, the airport and the way in, which is where they went unnoticed.
        They keep this one spot whatever the city holds: moving them once the
        first place lands would unmount the import mid-run and cancel the queue
        still resolving its addresses. A city with places gets them folded away.
      */}
      <PlacePacks
        cityName={city.name}
        startOpen={bare}
        onAdd={onAddPlaces}
        onLocate={(placeId, ll) => onPlace(placeId, 'll', ll)}
      />
      <AddPlace
        onAdd={onAddPlaces}
        onLocate={(placeId, ll) => onPlace(placeId, 'll', ll)}
      />

      {/* Lodging is compared and chosen on the Stay tab — this is just the tally. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0 7px' }}>
        <div className="mono" style={label}>Stay</div>
        <div className="mono num" style={{ ...label, fontSize: 9 }}>
          {active ? fmtUsd((Number(active.cost) || 0) * city.nights) + ' total' : '—'}
        </div>
      </div>
      <button
        className="tap"
        onClick={onOpenStay}
        style={{
          ...boxed, width: '100%', minHeight: 48, padding: '8px 10px', textAlign: 'left',
          color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 9,
        }}
      >
        <i
          className="ph ph-bed"
          style={{ flex: 'none', fontSize: 15, color: 'var(--color-accent-300)' }}
        />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500 }}>
            {active ? active.name || 'Untitled option' : 'No option active yet'}
          </span>
          <span className="mono" style={{ ...label, fontSize: 8.5 }}>
            {options
              ? `${options} ${options === 1 ? 'option' : 'options'} on the Stay tab`
              : 'add options on the Stay tab'}
          </span>
          <TouchMark touch={touch('hotelSel')} />
        </span>
        <i className="ph ph-caret-right" style={{ flex: 'none', fontSize: 12, color: 'var(--color-neutral-600)' }} />
      </button>

      {/* Arrival from the airport, per option. Renders nothing until one is pinned. */}
      <AirportRoutes city={city} travelers={travelers} onCity={onCity} onZoom={onZoom} />

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
              from={active?.ll ?? city.ll}
              onField={(key, val) => onPlace(p.id, key, val)}
              onRemove={() => onRemovePlace(p.id)}
              onZoom={() => p.ll && onZoom(p.ll, 16.5)}
              touch={touch('place/' + p.id)}
            />
          ))}
        </div>
      )}

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


function stepper(border: string, color: string) {
  return {
    width: 44, height: 44, borderRadius: 'var(--radius-sm)',
    border: '1px solid ' + border, background: 'transparent',
    color, fontSize: 14, cursor: 'pointer',
  } as const;
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
  const kind = placeKind(place.kind);
  const shot = place.images.find((src) => src.trim()) ?? '';
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
            background: 'var(--color-bg)', color: kind.color,
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
      {/* What the map card shows above the name. One photo is enough there. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {shot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot}
            alt=""
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
            style={{
              flex: 'none', width: 30, height: 24, objectFit: 'cover',
              borderRadius: 4, border: '1px solid var(--color-neutral-800)',
            }}
          />
        ) : null}
        <input
          type="url"
          value={place.images[0] ?? ''}
          placeholder="Photo URL"
          aria-label={`Photo for ${place.name || 'this place'}`}
          onChange={(e) => onField('images', e.target.value.trim() ? [e.target.value] : [])}
          style={{
            flex: 1, minWidth: 0, height: 32, fontSize: 10.5,
            fontFamily: 'var(--font-mono)', color: 'var(--color-neutral-400)',
          }}
        />
        {place.url ? (
          <a
            className="mono tap"
            href={place.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${place.name || 'this place'}`}
            style={{
              flex: 'none', display: 'flex', alignItems: 'center', height: 32, padding: '0 6px',
              fontSize: 9, color: 'var(--color-accent-300)', textDecoration: 'none',
            }}
          >
            Link ↗
          </a>
        ) : null}
      </div>
      {/* The walk time answers "is it near the hotel"; the geocoder's own note
          answers "is the pin where the address says". Both can matter at once. */}
      {walk ? (
        <span
          className="mono"
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--color-accent-300)' }}
        >
          <i className="ph ph-person-simple-walk" style={{ fontSize: 11 }} />
          {walk}
        </span>
      ) : null}
      {!walk || status.state !== 'idle' ? <GeoStatus status={status} /> : null}
    </div>
  );
}
