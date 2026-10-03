'use client';

import { ReactNode, useState } from 'react';
import { City, DayItem, LatLng, Place, TravelMode } from '@/lib/data';
import { hotelName } from '@/lib/hotelTier';
import type { Preset } from '@/lib/presets';
import DayFill from './DayFill';
import { Local } from './CityMoney';
import type { Rates } from '@/lib/money';
import { clashFor } from '@/lib/hours';
import { DayEntry, selectedHotel } from '@/lib/derive';
import { dateOf, fmtD, fmtDow, fmtUsd } from '@/lib/format';
import { HopResult } from '@/lib/useDayRoute';
import { fmtDistance, fmtDuration } from '@/lib/routing';
import { DayPlan, fmtClock, fmtSpan, parseClock } from '@/lib/dayPlan';

export interface DaysTabProps {
  schedule: DayEntry[];
  start: string;
  selected: number;
  hops: HopResult[];
  plan: DayPlan | null;
  /** Metro fare per person in this city, for pricing transit legs. */
  fare: number;
  travelers: number;
  /** The city this day is spent in — what the day is filled from. */
  city: City | null;
  /**
   * Rendered inside the Plan timeline, which already says which day this is
   * and what city it is in — so the day strip and that heading are left out.
   */
  embedded?: boolean;
  /**
   * What Claude can do for this day, rendered above the ways of adding a stop
   * by hand. Passed in rather than built here so the day planner stays a day
   * planner and knows nothing about trip codes or the network.
   */
  assist?: ReactNode;
  /** Where the day currently ends, so a candidate stop can be timed from it. */
  anchor: { ll: LatLng; label: string } | null;
  /** The day's exchange rates, for what the day costs where it is spent. */
  rates: Rates | null;
  onSelectDay: (n: number) => void;
  onAddItem: (key: string) => void;
  onSetItem: <K extends keyof DayItem>(key: string, id: string, field: K, val: DayItem[K]) => void;
  onToggleItem: (key: string, id: string) => void;
  onRemoveItem: (key: string, id: string) => void;
  onMoveItem: (key: string, id: string, dir: number) => void;
  onZoomDay: () => void;
  onZoomStop: (ll: LatLng) => void;
  onAddStop: (place: Place) => void;
  onApplyPreset: (preset: Preset, replace: boolean) => void;
  onSetFare: (fare: number) => void;
  onStartPlan: () => void;
}

export default function DaysTab({
  schedule, start, selected, hops, plan, fare, travelers, city, anchor, rates, embedded = false,
  assist,
  onSelectDay, onAddItem,
  onSetItem, onToggleItem, onRemoveItem, onMoveItem, onZoomDay, onZoomStop, onAddStop,
  onApplyPreset, onSetFare, onStartPlan,
}: DaysTabProps) {
  /**
   * Which stop is open for editing, if any. A day is read far more often than
   * it is changed, so a stop shows its line and opens its controls on a tap —
   * and only one at a time, which keeps the day one screen rather than four.
   */
  const [openStop, setOpenStop] = useState<string | null>(null);

  if (!schedule.length) {
    return <div style={empty}>Add a city on the Map tab and its nights show up here as days to plan.</div>;
  }

  const day = schedule[Math.min(Math.max(1, selected), schedule.length) - 1];
  const dt = dateOf(start, day.n - 1);
  const total = day.items.reduce((a, it) => a + (Number(it.cost) || 0), 0);
  const places = day.city.places;
  const hotel = selectedHotel(day.city);
  const hopFor = (id: string) => hops.find((h) => h.toId === id);

  // Read once for the whole day: which stops you cannot actually get into.
  // The per-stop line says what is wrong; this says that something is, at the
  // top, because a day is read by scrolling and a small line scrolls past.
  const weekday = dt.getDay();
  const shutStops = day.items.filter((it, i) => {
    const p = places.find((pl) => pl.id === it.placeId) ?? null;
    return clashFor(p, weekday, plan?.stops[i]?.arrive ?? null, plan?.stops[i]?.depart ?? null)
      ?.weight === 'hard';
  });

  return (
    <div>
      {embedded ? null : (
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 2, display: 'flex', gap: 6,
          overflowX: 'auto', padding: '2px 0 10px', background: 'var(--color-raised)',
        }}
      >
        {schedule.map((d) => {
          const on = d.n === day.n;
          return (
            <button
              key={d.key}
              className="tap"
              onClick={() => onSelectDay(d.n)}
              style={{
                flex: 'none', width: 44, height: 48, borderRadius: 'var(--radius-sm)',
                border: '1px solid ' + (on ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                background: on ? 'var(--color-accent-800)' : 'transparent',
                color: on ? 'var(--color-accent-100)' : 'var(--color-neutral-400)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 1, cursor: 'pointer',
              }}
            >
              <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>{d.n}</span>
              <span className="mono" style={{ fontSize: 8.5 }}>{fmtDow(dateOf(start, d.n - 1))}</span>
            </button>
          );
        })}
      </div>
      )}

      {embedded ? null : (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>{day.city.name}</div>
        <div>
          <div className="num" style={{ fontSize: 12.5, color: 'var(--color-neutral-400)', textAlign: 'right' }}>
            {total ? fmtUsd(total) : ''}
          </div>
          <Local usd={total} city={city} rates={rates} />
        </div>
      </div>
      )}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, margin: '3px 0 12px',
        }}
      >
        {/*
          * Whatever is above already says which day this is, and the stats row
          * below already gives the moving time, so this is only the date.
          */}
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)' }}>
          {embedded ? '' : fmtDow(dt) + ' ' + fmtD(dt)}
        </div>
        <button
          className="tap"
          onClick={onZoomDay}
          style={{
            flex: 'none', minHeight: 32, padding: '0 10px', borderRadius: 9999,
            border: '1px solid var(--color-neutral-800)', background: 'transparent',
            color: 'var(--color-accent-200)', fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <i className="ph ph-crosshair" style={{ fontSize: 12 }} />
          Zoom to day
        </button>
      </div>

      {plan && plan.stops.length ? (
        <div style={summary}>
          <Stat label="Out" value={`${fmtClock(plan.startMins)} – ${fmtClock(plan.startMins + plan.totalMins)}`} />
          <Stat label="Day" value={fmtSpan(plan.totalMins)} />
          <Stat label="Moving" value={fmtSpan(plan.movingMins)} />
          <Stat
            label="Fares"
            value={plan.transitCost ? fmtUsd(plan.transitCost) : fare ? '—' : 'set fare'}
            below={<Local usd={plan.transitCost} city={city} rates={rates} align="left" />}
          />
        </div>
      ) : null}

      {shutStops.length ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 8px', padding: '8px 10px',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-danger)',
            background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
            color: 'var(--color-danger)', fontSize: 11.5,
          }}
        >
          <i className="ph-fill ph-warning-circle" style={{ fontSize: 14, flex: 'none' }} />
          {shutStops.length === 1
            ? `${shutStops[0].title || 'A stop'} is shut when you get there`
            : `${shutStops.length} stops are shut when you get there`}
        </div>
      ) : null}

      {hotel?.ll ? (
        <div style={{ ...anchorRow }}>
          <i className="ph ph-bed" style={{ fontSize: 13, color: 'var(--color-accent-300)' }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
            Starting from {hotelName(hotel.name) || 'your hotel'}
          </span>
          <button
            className="tap"
            onClick={() => hotel.ll && onZoomStop(hotel.ll)}
            aria-label="Show hotel on the map"
            style={iconBtn}
          >
            <i className="ph ph-map-pin" style={{ fontSize: 13 }} />
          </button>
        </div>
      ) : null}

      {day.items.length === 0 ? (
        <div style={empty}>
          Nothing planned for this day yet. Pick one of {day.city.name}&rsquo;s places below and it
          lands here, timed and priced from wherever the day has got to.
        </div>
      ) : (
        day.items.map((it, i) => {
          const place = places.find((p) => p.id === it.placeId) ?? null;
          const hop = hopFor(it.id);
          return (
            <div key={it.id}>
              {hop ? (
                <HopStrip
                  hop={hop}
                  mode={it.mode}
                  fare={fare * Math.max(1, travelers)}
                  onMode={(m) => onSetItem(day.key, it.id, 'mode', m)}
                />
              ) : null}
              <StopCard
                index={i}
                item={it}
                open={openStop === it.id}
                onOpen={() => setOpenStop((cur) => (cur === it.id ? null : it.id))}
                weekday={weekday}
                arrive={plan?.stops[i]?.arrive ?? null}
                depart={plan?.stops[i]?.depart ?? null}
                place={place}
                places={places}
                first={i === 0}
                last={i === day.items.length - 1}
                onSet={(field, val) => onSetItem(day.key, it.id, field, val)}
                onToggle={() => onToggleItem(day.key, it.id)}
                onRemove={() => onRemoveItem(day.key, it.id)}
                onMove={(dir) => onMoveItem(day.key, it.id, dir)}
                onZoom={() => place?.ll && onZoomStop(place.ll)}
              />
            </div>
          );
        })
      )}

      {/* However the day ends, it ends back at the hotel — so it is always shown. */}
      {plan?.back && hotel ? (
        <div style={{ ...anchorRow, marginTop: 8 }}>
          <i
            className="ph ph-arrow-u-down-left"
            style={{ fontSize: 13, color: 'var(--color-accent-300)' }}
          />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                display: 'block', fontSize: 12,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              Back to {hotelName(hotel.name) || 'your hotel'}
            </span>
            <span
              className="mono"
              style={{
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                fontSize: 9, color: 'var(--color-neutral-500)',
              }}
            >
              <i
                className={
                  'ph ' +
                  (plan.back.mode !== 'transit'
                    ? 'ph-person-simple-walk'
                    : plan.back.rail
                      ? 'ph-train'
                      : 'ph-train-simple')
                }
                style={{ fontSize: 10 }}
              />
              <span className="num">{fmtSpan(plan.back.mins)}</span>
              {plan.back.mode !== 'transit' ? 'on foot' : plan.back.rail ? 'by train' : 'by metro'}
              {plan.back.mode === 'transit' && plan.back.walkMins ? (
                <span className="num">{fmtSpan(plan.back.walkMins)} of it walking</span>
              ) : null}
              {plan.back.cost ? <span className="num">{fmtUsd(plan.back.cost)}</span> : null}
              {plan.back.estimated ? <span style={{ fontSize: 7.5, opacity: 0.7 }}>EST</span> : null}
            </span>
          </span>
          <span className="mono num" style={{ flex: 'none', fontSize: 9.5, color: 'var(--color-accent-300)' }}>
            {fmtClock(plan.startMins + plan.totalMins)}
          </span>
        </div>
      ) : null}

      {assist}

      <DayFill
        city={city}
        anchor={anchor}
        metroFare={fare}
        travelers={travelers}
        rates={rates}
        onApplyPreset={onApplyPreset}
        onAddStop={onAddStop}
        weekday={weekday}
        inDay={pinned(day.items)}
        inDayKinds={pinned(day.items)
          .map((id) => day.city.places.find((p) => p.id === id)?.kind)
          .filter((k): k is Place['kind'] => Boolean(k))}
        elsewhere={schedule.filter((e) => e.key !== day.key).flatMap((e) => pinned(e.items))}
        onAddBlank={() => onAddItem(day.key)}
        onSetFare={onSetFare}
        onZoom={onZoomStop}
        onStartPlan={onStartPlan}
      />
    </div>
  );
}

/** The places a list of stops stands on — a typed-in stop stands on none. */
function pinned(items: DayItem[]): string[] {
  return items.map((it) => it.placeId).filter((id): id is string => Boolean(id));
}

/** The travel strip between two stops: walk vs metro, with the better one marked. */
function HopStrip({
  hop, mode, fare, onMode,
}: {
  hop: HopResult;
  mode: TravelMode;
  /** Fare for the whole party, already multiplied. */
  fare: number;
  onMode: (m: TravelMode) => void;
}) {
  const { walk, transit } = hop.options;

  if (hop.loading) {
    return (
      <div style={hopWrap}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
          Routing…
        </span>
      </div>
    );
  }
  if (!walk && !transit) {
    return (
      <div style={hopWrap}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-700)' }}>
          No route found
        </span>
      </div>
    );
  }

  const opts: { id: TravelMode; icon: string; leg: typeof walk }[] = [
    { id: 'walk', icon: 'ph-person-simple-walk', leg: walk },
    { id: 'transit', icon: 'ph-train-simple', leg: transit },
  ];

  return (
    <div style={hopWrap}>
      <span style={{ width: 1, height: 14, background: 'var(--color-neutral-800)', marginLeft: 8 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', paddingLeft: 4 }}>
        {opts.map(({ id, icon, leg }) => {
          if (!leg) return null;
          const on = mode === id;
          const best = hop.suggested === id;
          return (
            <button
              key={id}
              className="tap"
              onClick={() => onMode(id)}
              aria-pressed={on}
              title={leg.summary ?? (id === 'walk' ? 'Walking' : 'Transit')}
              style={{
                minHeight: 30, padding: '0 9px', borderRadius: 9999, cursor: 'pointer',
                border: '1px solid ' + (on ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                background: on ? 'var(--tint-accent)' : 'transparent',
                color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)',
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
              }}
            >
              <i className={'ph ' + icon} style={{ fontSize: 12 }} />
              <span className="num">{fmtDuration(leg.seconds)}</span>
              <span className="mono num" style={{ fontSize: 8.5, opacity: 0.75 }}>
                {id === 'transit' ? (fare ? fmtUsd(fare) : 'fare?') : fmtDistance(leg.meters)}
              </span>
              {leg.estimated ? (
                <span className="mono" style={{ fontSize: 7.5, opacity: 0.7 }} title="Estimated, not routed">
                  EST
                </span>
              ) : null}
              {best ? (
                <i
                  className="ph-fill ph-star"
                  style={{ fontSize: 9, color: 'var(--color-accent-300)' }}
                  title="Faster option"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, below }: { label: string; value: string; below?: React.ReactNode }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="mono" style={{ fontSize: 8.5, color: 'var(--color-neutral-600)' }}>{label}</div>
      <div className="num" style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{value}</div>
      {below}
    </div>
  );
}

function StopCard({
  index, item, place, places, first, last, arrive, depart, weekday, open, onOpen, onSet,
  onToggle, onRemove, onMove, onZoom,
}: {
  index: number;
  item: DayItem;
  /** Open for editing. One stop at a time, so the day stays readable. */
  open: boolean;
  onOpen: () => void;
  arrive: number | null;
  depart: number | null;
  /** The weekday this stop falls on, for checking it against the place's hours. */
  weekday: number;
  place: Place | null;
  places: Place[];
  first: boolean;
  last: boolean;
  onSet: <K extends keyof DayItem>(field: K, val: DayItem[K]) => void;
  onToggle: () => void;
  onRemove: () => void;
  onMove: (dir: number) => void;
  onZoom: () => void;
}) {
  const clash = clashFor(place, weekday, arrive, depart);
  const hard = clash?.weight === 'hard';
  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        // A stop you cannot get into is outlined, not just annotated: the day
        // is read by scrolling, and a line of small text scrolls past.
        border: '1px solid ' + (hard ? 'var(--color-danger)' : 'var(--color-neutral-800)'),
        background: 'var(--color-surface)', padding: '8px 9px', marginTop: 6,
        animation: 'riseIn .3s ease both', animationDelay: index * 40 + 'ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <button
          className="tap"
          onClick={onToggle}
          aria-label={item.done ? 'Mark not done' : 'Mark done'}
          aria-pressed={item.done}
          style={{
            flex: 'none', width: 22, height: 22, borderRadius: 9999, padding: 0, cursor: 'pointer',
            border: '1px solid ' + (item.done ? 'var(--color-accent-500)' : 'var(--color-neutral-600)'),
            background: item.done ? 'var(--color-accent-500)' : 'transparent',
            color: 'var(--color-bg)', fontSize: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {item.done ? <i className="ph-fill ph-check" /> : <span className="num" style={{ color: 'var(--color-neutral-500)', fontSize: 10 }}>{index + 1}</span>}
        </button>
        {open ? (
          <span style={{ flex: 'none', width: 62 }}>
            <input
              type="time"
              value={item.time}
              aria-label="Time"
              placeholder={arrive !== null ? fmtClock(arrive) : ''}
              onChange={(e) => onSet('time', e.target.value)}
              className="mono num"
              style={{
                width: '100%', fontSize: 10, background: 'transparent', border: 'none',
                color: item.time ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
              }}
            />
            {!item.time && arrive !== null ? (
              <span className="mono num" style={{ fontSize: 8.5, color: 'var(--color-neutral-600)' }}>
                ~{fmtClock(arrive)}
              </span>
            ) : null}
          </span>
        ) : (
          <span
            className="mono num"
            style={{
              flex: 'none', fontSize: 10,
              color: item.time ? 'var(--color-accent-200)' : 'var(--color-neutral-600)',
            }}
          >
            {item.time ? fmtClock(parseClock(item.time) ?? 0) : arrive !== null ? '~' + fmtClock(arrive) : '—'}
          </span>
        )}
        <input
          type="text"
          value={item.title}
          placeholder="What are you doing?"
          onChange={(e) => onSet('title', e.target.value)}
          style={{
            flex: 1, minWidth: 0, height: 30, fontSize: 13.5, fontWeight: 500,
            textDecoration: item.done ? 'line-through' : 'none',
            color: item.done ? 'var(--color-neutral-600)' : 'var(--color-text)',
          }}
        />
        {open ? (
          <>
            <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>$</span>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              value={item.cost || ''}
              placeholder="0"
              aria-label="Cost"
              onChange={(e) => onSet('cost', Number(e.target.value) || 0)}
              className="num"
              style={{ flex: 'none', width: 46, fontSize: 11.5, textAlign: 'right' }}
            />
          </>
        ) : item.cost ? (
          <span className="num" style={{ flex: 'none', fontSize: 11.5, color: 'var(--color-neutral-400)' }}>
            {fmtUsd(item.cost)}
          </span>
        ) : null}
        <button
          className="tap"
          onClick={onOpen}
          aria-expanded={open}
          aria-label={open ? 'Done editing this stop' : 'Edit this stop'}
          style={{ ...iconBtn, width: 28, height: 28, color: 'var(--color-neutral-600)' }}
        >
          <i className={open ? 'ph ph-caret-up' : 'ph ph-caret-down'} style={{ fontSize: 12 }} />
        </button>
      </div>

      {/* Closed, a stop still says where it is and how long it has. */}
      {!open ? (
        <div
          className="mono"
          style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, paddingLeft: 29,
            fontSize: 8.5, color: 'var(--color-neutral-600)',
          }}
        >
          <span
            style={{
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              // A place's own name, not a label — it keeps its capitals.
              textTransform: 'none', letterSpacing: 0, fontSize: 9.5,
              color: place ? 'var(--color-accent-300)' : 'var(--color-neutral-700)',
            }}
          >
            {place
              ? place.name.trim() && place.name.trim() !== item.title.trim()
                ? place.name
                : ''
              : 'No location'}
          </span>
          {item.dwell ? (
            <span className="num" style={{ flex: 'none' }}>
              {item.dwell} min{depart !== null ? ` · till ${fmtClock(depart)}` : ''}
            </span>
          ) : null}
          {item.note.trim() ? <i className="ph ph-note" style={{ flex: 'none', fontSize: 10 }} /> : null}
        </div>
      ) : null}

      {open ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <select
          value={item.placeId ?? ''}
          aria-label="Where this stop is"
          onChange={(e) => onSet('placeId', e.target.value || null)}
          style={{
            flex: 1, minWidth: 0, minHeight: 34, fontSize: 11.5, padding: '0 8px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
            background: 'var(--color-bg)',
            color: place ? 'var(--color-accent-200)' : 'var(--color-neutral-600)',
          }}
        >
          <option value="">No location — not routed</option>
          {places.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.ll}>
              {p.name || 'Unnamed place'}
              {p.ll ? '' : ' (no coordinates)'}
            </option>
          ))}
        </select>
        <button
          className="tap"
          onClick={onZoom}
          disabled={!place?.ll}
          aria-label="Show this stop on the map"
          style={{ ...iconBtn, color: place?.ll ? 'var(--color-accent-300)' : 'var(--color-neutral-800)' }}
        >
          <i className="ph ph-map-pin" style={{ fontSize: 13 }} />
        </button>
        <button
          className="tap"
          onClick={() => onMove(-1)}
          disabled={first}
          aria-label="Move stop earlier"
          style={{ ...iconBtn, opacity: first ? 0.3 : 1 }}
        >
          <i className="ph ph-arrow-up" style={{ fontSize: 12 }} />
        </button>
        <button
          className="tap"
          onClick={() => onMove(1)}
          disabled={last}
          aria-label="Move stop later"
          style={{ ...iconBtn, opacity: last ? 0.3 : 1 }}
        >
          <i className="ph ph-arrow-down" style={{ fontSize: 12 }} />
        </button>
        <button className="tap" onClick={onRemove} aria-label="Remove stop" style={iconBtn}>
          <i className="ph ph-trash" style={{ fontSize: 12 }} />
        </button>
      </div>
      ) : null}

      {open ? (
      <input
        type="text"
        value={item.note}
        placeholder="Note"
        onChange={(e) => onSet('note', e.target.value)}
        style={{ width: '100%', fontSize: 11, height: 28, color: 'var(--color-neutral-500)' }}
      />
      ) : null}
      {open ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="mono" style={{ fontSize: 8.5, color: 'var(--color-neutral-600)', flex: 1 }}>
          stay
        </span>
        <input
          type="number"
          min={0}
          step={15}
          inputMode="numeric"
          value={item.dwell || ''}
          placeholder="60"
          aria-label="Minutes at this stop"
          onChange={(e) => onSet('dwell', Number(e.target.value) || 0)}
          className="num"
          style={{ flex: 'none', width: 40, fontSize: 11, textAlign: 'right' }}
        />
        <span className="mono" style={{ fontSize: 8.5, color: 'var(--color-neutral-600)' }}>
          min{depart !== null ? ` · till ${fmtClock(depart)}` : ''}
        </span>
      </div>
      ) : null}
      {clash ? (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 10.5,
            color: hard ? 'var(--color-danger)' : 'var(--color-warn)',
          }}
        >
          <i
            className={hard ? 'ph-fill ph-warning-circle' : 'ph ph-clock-countdown'}
            style={{ fontSize: 12, flex: 'none' }}
          />
          {clash.text}
        </div>
      ) : null}
    </div>
  );
}

const summary = {
  display: 'flex',
  gap: 10,
  padding: '9px 11px',
  marginBottom: 10,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-surface)',
};

const empty = {
  padding: 18,
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--color-neutral-800)',
  color: 'var(--color-neutral-600)',
  fontSize: 12.5,
  textAlign: 'center' as const,
  lineHeight: 1.5,
};

const hopWrap = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 0 2px',
  minHeight: 34,
};

const iconBtn = {
  flex: 'none' as const,
  width: 34,
  height: 34,
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-neutral-600)',
  cursor: 'pointer',
};

const anchorRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 9px',
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--color-neutral-800)',
  color: 'var(--color-neutral-400)',
};
