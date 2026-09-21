'use client';

import { City, Hotel, LatLng } from '@/lib/data';
import { Airport, airportByCode, airportsNear, nearestAirport } from '@/lib/airports';
import { RouteState, useAirportRoutes } from '@/lib/airportRoute';
import { fmtUsd } from '@/lib/format';
import { LEG_STYLE } from '@/lib/legKind';
import { fmtDistance, fmtDuration } from '@/lib/routing';

const label = { fontSize: 9.5, color: 'var(--color-neutral-500)' } as const;

/** The airport this city arrives at: whichever was picked, else the nearest. */
export function airportFor(city: City): Airport | null {
  return (city.airportCode ? airportByCode(city.airportCode) : null) ?? nearestAirport(city.ll);
}

export interface AirportRoutesProps {
  city: City;
  travelers: number;
  onCity: <K extends keyof City>(key: K, val: City[K]) => void;
  onZoom?: (ll: LatLng, zoom: number) => void;
}

/**
 * Getting in from the airport, for every hotel option rather than only the
 * selected one — the arrival is part of what makes one option better than
 * another, and it is easy to pick the cheap room an hour further out by
 * accident.
 *
 * Self-contained on purpose: it takes the city and renders the whole block,
 * so it can sit in the city panel or in a hotels tab without changing.
 */
export default function AirportRoutes({ city, travelers, onCity, onZoom }: AirportRoutesProps) {
  const airport = airportFor(city);
  const fare = Number(city.airportFare) || airport?.fare || Number(city.metroFare) || 0;
  const routes = useAirportRoutes(airport, city.hotels, { fare, travelers });
  const pinned = city.hotels.filter((h) => h.ll);

  if (!airport || !pinned.length) return null;

  const near = airportsNear(city.ll);
  const nearestCode = nearestAirport(city.ll)?.code ?? '';

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <div className="mono" style={label}>
          Airport → hotel · train or metro + walking
        </div>
        <select
          value={city.airportCode}
          aria-label="Arrival airport"
          onChange={(e) => onCity('airportCode', e.target.value)}
          style={{
            height: 30, maxWidth: 148, fontSize: 10.5, padding: '0 4px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
            background: 'var(--color-bg)', color: 'var(--color-accent-200)',
          }}
        >
          <option value="">{nearestCode ? `Nearest · ${nearestCode}` : 'Nearest'}</option>
          {near.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {pinned.map((h, i) => (
          <RouteRow
            key={h.id}
            hotel={h}
            index={city.hotels.indexOf(h)}
            selected={city.hotelSel === h.id}
            state={routes[h.id]}
            onZoom={onZoom && h.ll ? () => onZoom(h.ll as LatLng, 15) : undefined}
          />
        ))}
        {pinned.length < city.hotels.length ? (
          <div className="mono" style={{ ...label, fontSize: 9, color: 'var(--color-neutral-600)' }}>
            Options without an address aren&rsquo;t routed yet.
          </div>
        ) : null}
      </div>

      {/* The fare the ride is priced at — published fares are a starting figure. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 40, marginTop: 4,
          borderTop: '1px solid var(--color-neutral-900)',
        }}
      >
        <div className="mono" style={{ ...label, flex: 'none' }}>
          Fare from {airport.code}, $ / person
        </div>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          aria-label={'One-way fare per person from ' + airport.code}
          value={city.airportFare ? String(city.airportFare) : ''}
          placeholder={String(airport.fare)}
          onChange={(e) => onCity('airportFare', Number(e.target.value) || 0)}
          className="num"
          style={{ width: 64, fontSize: 12, fontWeight: 500 }}
        />
        <div className="mono num" style={{ ...label, marginLeft: 'auto' }}>
          {fmtUsd(fare * Math.max(1, travelers))} for {travelers}
        </div>
      </div>
    </div>
  );
}

function RouteRow({
  hotel, index, selected, state, onZoom,
}: {
  hotel: Hotel;
  index: number;
  selected: boolean;
  state?: RouteState;
  onZoom?: () => void;
}) {
  const route = state?.route ?? null;
  const name = hotel.name || 'Option ' + (index + 1);

  return (
    <button
      className="tap"
      onClick={onZoom}
      disabled={!onZoom}
      aria-label={'Show ' + name + ' on the map'}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '7px 9px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid ' + (selected ? 'var(--color-accent-600)' : 'var(--color-neutral-800)'),
        background: selected ? 'rgba(145,132,217,.08)' : 'var(--color-surface)',
        cursor: onZoom ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span
          style={{
            flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500,
            color: selected ? 'var(--color-accent-200)' : 'var(--color-text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        <span className="num" style={{ flex: 'none', fontSize: 12.5, fontWeight: 600 }}>
          {route ? fmtDuration(route.seconds) : '—'}
        </span>
        <span
          className="num"
          style={{ flex: 'none', fontSize: 12.5, fontWeight: 600, color: 'var(--color-accent-300)' }}
        >
          {route ? (route.cost ? fmtUsd(route.cost) : 'free') : ''}
        </span>
      </div>

      <div
        className="mono"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          fontSize: 9, color: 'var(--color-neutral-500)', marginTop: 3,
        }}
      >
        {state?.loading ? <span>Routing…</span> : null}
        {!state?.loading && !route ? <span>No route found</span> : null}
        {route ? (
          <>
            {route.rideSeconds ? (
              <span
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: LEG_STYLE[route.rail ? 'rail' : 'metro'].color,
                }}
              >
                <i className={'ph ' + (route.rail ? 'ph-train' : 'ph-train-simple')} style={{ fontSize: 11 }} />
                <span className="num">{fmtDuration(route.rideSeconds)}</span> {route.rail ? 'train' : 'metro'}
              </span>
            ) : null}
            {route.walkSeconds ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: LEG_STYLE.walk.color }}>
                <i className="ph ph-person-simple-walk" style={{ fontSize: 11 }} />
                <span className="num">{fmtDuration(route.walkSeconds)}</span> walking
              </span>
            ) : null}
            <span className="num" style={{ color: 'var(--color-neutral-600)' }}>
              {fmtDistance(route.meters)}
            </span>
            {route.summary ? (
              <span
                style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: 'var(--color-neutral-600)',
                }}
              >
                {route.summary}
              </span>
            ) : null}
            {route.estimated ? (
              <span style={{ fontSize: 7.5, opacity: 0.7 }} title="Modelled, not routed">
                EST
              </span>
            ) : null}
          </>
        ) : null}
      </div>
    </button>
  );
}
