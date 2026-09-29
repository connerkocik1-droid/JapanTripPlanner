'use client';

import { useState } from 'react';
import {
  City, Hood, LatLng, MAX_NIGHTS, MEALS, Meal, PLACE_KINDS, Place, VOTES, Vote, placeKind,
} from '@/lib/data';
import { ratingLine } from '@/lib/placeDetails';
import { fmtUsd, walkLabel } from '@/lib/format';
import { CitySpend } from '@/lib/derive';
import { isFlightLeg } from '@/lib/legKind';
import { Touch } from '@/lib/tripState';
import AirportRoutes from './AirportRoutes';
import AddPlace from './AddPlace';
import PlacePacks from './PlacePacks';
import TouchMark, { touchStyle } from './TouchMark';
import { GeoStatus, NumField, boxed, ghostBtn, label, useGeocodedAddress } from './fields';
import CityMoney, { Local } from './CityMoney';
import type { Rates } from '@/lib/money';
import { WEEKDAYS, hoursLine } from '@/lib/hours';
import { blankHood, groupByHood } from '@/lib/hoods';

export interface CityPanelProps {
  city: City;
  /** The day's exchange rates, for showing what the city's figures come to there. */
  rates: Rates | null;
  /** Those rates are from an earlier day than today. */
  ratesStale: boolean;
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
  city, spend, travelers, rates, ratesStale, onCity, onOpenStay,
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

      {/*
        Neighbourhoods. The map draws one pin each in place of a pin per
        place, so this is where the words and pictures behind those pins are
        written. Membership is read off addresses, so there is nothing to sort
        by hand here — only what a part of the city is like.
      */}
      <Hoods city={city} onCity={onCity} onZoom={onZoom} />

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
        style={{ width: '100%', height: 32, accentColor: 'var(--color-accent)' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div className="mono" style={{ ...label, fontSize: 9, color: 'var(--color-neutral-600)' }}>$0</div>
        <div className="mono num" style={{ ...label, fontSize: 9 }}>
          {fmtUsd(city.foodPer * city.nights)} over {city.nights} {city.nights === 1 ? 'day' : 'days'}
        </div>
        <div className="mono" style={{ ...label, fontSize: 9, color: 'var(--color-neutral-600)' }}>$300</div>
      </div>

      <CityMoney city={city} rates={rates} stale={ratesStale} onCity={onCity} />

      {/* Subtotal */}
      <div style={{ borderTop: '1px solid var(--color-divider)', margin: '12px 0 9px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>{city.name} subtotal</div>
        <div>
          <div className="num" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent-200)', textAlign: 'right' }}>
            {fmtUsd(spend.total)}
          </div>
          <Local usd={spend.total} city={city} rates={rates} />
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
    <div
      style={{
        ...boxed, padding: '4px 8px 8px',
        // The head row's select, inputs and buttons together are wider than a
        // phone, and without this the card grew to fit them and ran off the
        // right edge, taking anything full-width inside it with it.
        width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
        opacity: place.vote === 'no' ? 0.55 : 1,
        ...(touchStyle(touch) ?? {}),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <select
          value={place.kind}
          aria-label="Kind of place"
          onChange={(e) => onField('kind', e.target.value as Place['kind'])}
          style={{
            flex: 'none', width: 58, minWidth: 0, height: 34, fontSize: 11, padding: '0 4px',
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
          style={{
            flex: 'none', width: 44, minWidth: 0, height: 38, fontSize: 11.5,
            color: 'var(--color-accent-300)',
          }}
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
      <VoteRow vote={place.vote} onVote={(v) => onField('vote', v)} />

      <Facts place={place} onField={onField} />
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
      <Hours place={place} onField={onField} />
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

/**
 * When this place is open. Optional throughout — a place with nothing filled
 * in never warns about anything — but once the hours are here, a day that
 * plans a stop outside them says so.
 */
function Hours({
  place, onField,
}: {
  place: Place;
  onField: <K extends keyof Place>(key: K, val: Place[K]) => void;
}) {
  const [open, setOpen] = useState(
    Boolean(place.opens || place.closes || (place.shutDays ?? []).length),
  );
  const shut = place.shutDays ?? [];
  const summary = hoursLine(place);

  if (!open) {
    return (
      <button
        className="tap"
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, minHeight: 28, padding: 0,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-neutral-600)', fontSize: 10,
        }}
      >
        <i className="ph ph-clock" style={{ fontSize: 11 }} />
        Add opening hours
      </button>
    );
  }

  return (
    <div style={{ marginTop: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono" style={{ ...label, flex: 'none' }}>Open</span>
        <input
          type="time"
          value={place.opens}
          aria-label={`Opening time for ${place.name || 'this place'}`}
          onChange={(e) => onField('opens', e.target.value)}
          className="mono num"
          style={{ width: 84, height: 32, fontSize: 11 }}
        />
        <span className="mono" style={{ ...label, flex: 'none' }}>to</span>
        <input
          type="time"
          value={place.closes}
          aria-label={`Closing time for ${place.name || 'this place'}`}
          onChange={(e) => onField('closes', e.target.value)}
          className="mono num"
          style={{ width: 84, height: 32, fontSize: 11 }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        <span className="mono" style={{ ...label, flex: 'none', marginRight: 2 }}>Shut</span>
        {WEEKDAYS.map((d, i) => {
          const on = shut.includes(i);
          return (
            <button
              key={d}
              className="tap"
              aria-pressed={on}
              aria-label={`${place.name || 'This place'} is closed on ${d}`}
              onClick={() =>
                onField('shutDays', on ? shut.filter((n) => n !== i) : [...shut, i].sort())
              }
              style={{
                minWidth: 30, height: 28, borderRadius: 9999, cursor: 'pointer', fontSize: 9.5,
                border: '1px solid ' + (on ? 'var(--color-danger)' : 'var(--color-neutral-800)'),
                background: on ? 'color-mix(in srgb, var(--color-danger) 12%, transparent)' : 'transparent',
                color: on ? 'var(--color-danger)' : 'var(--color-neutral-500)',
              }}
            >
              {d.slice(0, 1)}
            </button>
          );
        })}
      </div>
      {summary ? (
        <div className="mono" style={{ ...label, fontSize: 9, marginTop: 4, color: 'var(--color-neutral-600)' }}>
          {summary}
        </div>
      ) : null}
    </div>
  );
}


/**
 * What a place is rated, and — where it is somewhere to eat — what it serves
 * and when it is worth going.
 *
 * The cuisine came off the shortlist or a directory and the meals were worked
 * out from the opening hours, so both are already filled in by the time anyone
 * looks. This is where they get corrected: the meals are toggles because the
 * app's guess is a suggestion, and a suggestion you cannot overrule is just a
 * wrong answer. A rating is shown rather than typed — it belongs to whoever
 * published it, and editing it here would only make the card lie.
 *
 * A museum gets the rating and stops there. It serves no cuisine, and "best at
 * lunch" about a palace would be an invention rather than a suggestion.
 */
function Facts({
  place, onField,
}: {
  place: Place;
  onField: <K extends keyof Place>(key: K, val: Place[K]) => void;
}) {
  const meals = place.meals ?? [];
  const score = ratingLine(place.rating, place.ratingCount);
  const eats = place.kind === 'eat';
  if (!eats && !score) return null;
  const toggle = (id: Meal) =>
    onField('meals', meals.includes(id) ? meals.filter((m) => m !== id) : [...meals, id]);

  const rating = score ? (
    <span className="mono num" style={{ ...label, flex: 'none', color: 'var(--color-accent-300)' }}>
      {score}
    </span>
  ) : null;

  if (!eats) {
    return <div style={{ display: 'flex', margin: '5px 0 2px' }}>{rating}</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 5, margin: '5px 0 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text"
          value={place.cuisine}
          placeholder="Cuisine — sushi, KBBQ"
          aria-label={`What ${place.name || 'this place'} serves`}
          onChange={(e) => onField('cuisine', e.target.value)}
          style={{ flex: 1, minWidth: 0, height: 34, fontSize: 11.5 }}
        />
        {rating}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {MEALS.map((m) => {
          const on = meals.includes(m.id);
          return (
            <button
              key={m.id}
              className="tap"
              aria-pressed={on}
              aria-label={`Best at ${m.label.toLowerCase()}`}
              onClick={() => toggle(m.id)}
              style={{
                flex: '1 1 0', minWidth: 0, minHeight: 32, boxSizing: 'border-box',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                border: '1px solid ' + (on ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                background: on ? 'var(--color-accent-500)' : 'transparent',
                color: on ? 'var(--color-on-accent)' : 'var(--color-neutral-500)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                fontSize: 11, fontWeight: on ? 600 : 500,
              }}
            >
              <i className={'ph ' + m.icon} style={{ fontSize: 12 }} />
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Yes, maybe or no on a place.
 *
 * The point of it is the map: a yes is plotted, a maybe is plotted faintly,
 * and a no is not plotted at all, so the map shows the trip still under
 * consideration rather than everything anyone has ever pinned. Pressing the
 * answer already showing takes it back to undecided, which plots like a yes.
 */
/**
 * The city's neighbourhoods, folded away until opened.
 *
 * Everything here is optional. A neighbourhood arrives from the shipped set
 * already named and placed, with a line about what it is like; what it does
 * not arrive with is photographs, because inventing image addresses would put
 * broken pictures on the map. So the one field that matters is the photo
 * links, and the rest is there to be corrected rather than filled in.
 */
function Hoods({
  city, onCity, onZoom,
}: {
  city: City;
  onCity: <K extends keyof City>(key: K, val: City[K]) => void;
  onZoom: (ll: LatLng, zoom: number) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const hoods = city.hoods ?? [];
  // How many places each one caught, so an edit to the matching can be seen
  // working without leaving the tab.
  const counts = new Map(groupByHood(city).groups.map((g) => [g.hood.id, g.places.length]));

  const write = (id: string, patch: Partial<Hood>) =>
    onCity('hoods', hoods.map((h) => (h.id === id ? { ...h, ...patch } : h)));

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 7px' }}>
        <div className="mono" style={label}>Neighbourhoods</div>
        <div className="mono num" style={{ ...label, fontSize: 9 }}>
          {hoods.length ? `${hoods.length} on the map` : 'none yet'}
        </div>
      </div>
      {hoods.length === 0 ? (
        <div style={emptyNote}>
          Parts of the city — Myeongdong, Shibuya. The map draws one pin each,
          with what is in it, instead of a pin per place.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {hoods.map((h) => {
            const isOpen = open === h.id;
            const held = counts.get(h.id) ?? 0;
            return (
              <div key={h.id} style={{ ...boxed, padding: '2px 8px', boxSizing: 'border-box', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 42 }}>
                  <i
                    className="ph ph-buildings"
                    style={{ flex: 'none', fontSize: 14, color: 'var(--color-accent-300)' }}
                  />
                  <input
                    type="text"
                    value={h.name}
                    placeholder="Neighbourhood"
                    aria-label="Neighbourhood name"
                    onChange={(e) => write(h.id, { name: e.target.value })}
                    style={{ flex: 1, minWidth: 0, height: 40, fontSize: 12.5, fontWeight: 500 }}
                  />
                  <span
                    className="mono num"
                    aria-label={`${held} pinned here`}
                    style={{ ...label, flex: 'none', fontSize: 9 }}
                  >
                    {held}
                  </span>
                  {h.ll ? (
                    <button
                      className="tap"
                      aria-label={`Show ${h.name || 'this neighbourhood'} on the map`}
                      onClick={() => h.ll && onZoom(h.ll, 14)}
                      style={iconBtn}
                    >
                      <i className="ph ph-crosshair" style={{ fontSize: 13 }} />
                    </button>
                  ) : null}
                  <button
                    className="tap"
                    aria-label={isOpen ? 'Close' : `Edit ${h.name || 'this neighbourhood'}`}
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : h.id)}
                    style={iconBtn}
                  >
                    <i className={'ph ' + (isOpen ? 'ph-caret-up' : 'ph-caret-down')} style={{ fontSize: 13 }} />
                  </button>
                </div>
                {isOpen ? (
                  <>
                    <textarea
                      value={h.blurb}
                      placeholder="What this part of the city is like"
                      aria-label="Neighbourhood description"
                      rows={3}
                      onChange={(e) => write(h.id, { blurb: e.target.value })}
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 0', fontSize: 11.5,
                        lineHeight: 1.45, resize: 'vertical',
                        borderTop: '1px solid var(--color-neutral-900)',
                      }}
                    />
                    <textarea
                      value={h.images.join('\n')}
                      placeholder="Photo links, one per line"
                      aria-label="Neighbourhood photo links"
                      rows={2}
                      onChange={(e) =>
                        write(h.id, { images: e.target.value.split('\n').map((v) => v.trim()).filter(Boolean) })
                      }
                      style={{
                        width: '100%', boxSizing: 'border-box', padding: '8px 0', fontSize: 10.5,
                        fontFamily: 'var(--font-mono)', color: 'var(--color-accent-300)', resize: 'vertical',
                        borderTop: '1px solid var(--color-neutral-900)',
                      }}
                    />
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, minHeight: 42,
                        borderTop: '1px solid var(--color-neutral-900)',
                      }}
                    >
                      <div className="mono" style={{ ...label, flex: 'none' }}>In addresses</div>
                      <input
                        type="text"
                        value={h.match.join(', ')}
                        placeholder="Jongno-gu, Insa-dong"
                        aria-label="Address words that mean this neighbourhood"
                        onChange={(e) =>
                          write(h.id, { match: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })
                        }
                        style={{
                          flex: 1, minWidth: 0, height: 40, fontSize: 11,
                          fontFamily: 'var(--font-mono)', textAlign: 'right',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        minHeight: 42, borderTop: '1px solid var(--color-neutral-900)',
                      }}
                    >
                      <span className="mono" style={{ ...label, fontSize: 9 }}>
                        {h.ll ? 'Pinned' : 'Sits over whatever it catches'}
                      </span>
                      <button
                        className="tap"
                        onClick={() => {
                          setOpen(null);
                          onCity('hoods', hoods.filter((x) => x.id !== h.id));
                        }}
                        style={{
                          minHeight: 40, padding: '0 10px', margin: '0 -10px 0 0', border: 'none',
                          background: 'none', color: 'var(--color-danger)', fontSize: 11, cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <button
        className="tap"
        onClick={() => {
          const h = blankHood();
          onCity('hoods', [...hoods, h]);
          setOpen(h.id);
        }}
        style={ghostBtn}
      >
        <i className="ph ph-plus" style={{ fontSize: 12 }} />
        Add a neighbourhood
      </button>
    </>
  );
}

const iconBtn = {
  flex: 'none' as const,
  width: 34,
  height: 40,
  border: 'none',
  background: 'none',
  color: 'var(--color-neutral-500)',
  cursor: 'pointer',
};

function VoteRow({ vote, onVote }: { vote: Vote; onVote: (v: Vote) => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 5, margin: '5px 0 2px',
        width: '100%', boxSizing: 'border-box',
      }}
    >
      {VOTES.map((v) => {
        const on = vote === v.id;
        const tone =
          v.id === 'yes'
            ? 'var(--color-accent-400)'
            : v.id === 'maybe'
              ? 'var(--color-warn)'
              : 'var(--color-danger)';
        return (
          <button
            key={v.id}
            className="tap"
            aria-pressed={on}
            aria-label={v.label}
            onClick={() => onVote(on ? '' : v.id)}
            style={{
              flex: '1 1 0', minWidth: 0, minHeight: 34,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer', boxSizing: 'border-box',
              border: '1px solid ' + (on ? tone : 'var(--color-neutral-800)'),
              background: on ? tone : 'transparent',
              color: on ? 'var(--color-on-accent)' : 'var(--color-neutral-500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              fontSize: 11.5, fontWeight: on ? 600 : 500,
            }}
          >
            <i className={'ph ' + v.icon} style={{ fontSize: 13 }} />
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
