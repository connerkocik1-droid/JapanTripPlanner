'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { City, DEFAULT_DWELL, LatLng, PLACE_KINDS, Place, uid } from '@/lib/data';
import { planDay } from '@/lib/dayPlan';
import type { Preset } from '@/lib/presets';
import { derive, selectedHotel } from '@/lib/derive';
import { dateOf, fmtD, fmtUsd } from '@/lib/format';
import type { RouteStop } from '@/lib/geo';
import { isFlightLeg } from '@/lib/legKind';
import { geocode, hitToLatLng } from '@/lib/geocode';
import { PEOPLE, PERSON_LIST } from '@/lib/people';
import { useTripStore } from '@/lib/tripState';
import type { MapFocus, MapLeg, MapPin } from './TripMap';
import { useDayRoute, type Stop } from '@/lib/useDayRoute';
import CityPanel from './CityPanel';
import DaysTab from './DaysTab';
import BuilderTab from './BuilderTab';
import ChecklistTab from './ChecklistTab';
import Login from './Login';
import NotesTab from './NotesTab';
import StayTab from './StayTab';
import PrintSheet from './PrintSheet';
import TouchMark, { touchStyle } from './TouchMark';
import TripSettings from './TripSettings';

// MapLibre touches window on import — keep it off the server render.
const TripMap = dynamic(() => import('./TripMap'), { ssr: false });

type Tab = 'map' | 'cities' | 'stay' | 'days' | 'build' | 'list' | 'notes';

/** The tab strip, in order. The map is first and is the default view. */
const TABS: [Tab, string, string][] = [
  ['map', 'Map', 'ph-map-trifold'],
  ['cities', 'Cities', 'ph-buildings'],
  ['stay', 'Stay', 'ph-bed'],
  ['days', 'Days', 'ph-calendar-blank'],
  ['build', 'Build', 'ph-squares-four'],
  ['list', 'Checklist', 'ph-check-square'],
  ['notes', 'Notes', 'ph-chat-teardrop-text'],
];

const SEG_FILL: Record<string, string> = {
  Lodging: 'var(--color-accent-400)',
  Transit: 'var(--color-accent-600)',
  Food: 'var(--color-accent-800)',
};

export default function TripPlanner() {
  const store = useTripStore();
  const { doc } = store;

  const [tab, setTab] = useState<Tab>('map');
  const [cityId, setCityId] = useState<string | null>(null);
  const [day, setDay] = useState(1);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [adding, setAdding] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [locating, setLocating] = useState(false);
  const [settings, setSettings] = useState(false);
  const [online, setOnline] = useState(true);
  const [plotAll, setPlotAll] = useState(true);
  const [fit, setFit] = useState<{ points: LatLng[]; nonce: number } | null>(null);
  const fitNonce = useRef(0);
  const shell = useRef<HTMLDivElement | null>(null);
  const activeTab = useRef<HTMLButtonElement | null>(null);
  const focusNonce = useRef(0);

  const d = useMemo(() => derive(doc), [doc]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  useEffect(() => {
    if (cityId && !doc.cities.some((c) => c.id === cityId)) setCityId(null);
  }, [doc.cities, cityId]);
  useEffect(() => {
    if (day > d.schedule.length) setDay(Math.max(1, d.schedule.length));
  }, [d.schedule.length, day]);

  /**
   * How much of the map's bottom edge is covered. Nothing sits over the map any
   * more, so this is just the clearance for the plot-all pill.
   */
  const mapInset = tab === 'map' && d.cities.length > 1 ? 58 : 8;

  // The strip scrolls when the tabs outrun the width — keep the current one in view.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [tab]);

  const zoomTo = useCallback((ll: LatLng, zoom: number) => {
    focusNonce.current += 1;
    setFocus({ ll, zoom, nonce: focusNonce.current });
  }, []);

  const selectCity = useCallback(
    (id: string) => {
      const same = id === cityId;
      setCityId(same ? null : id);
      if (same) {
        setFocus(null);
        return;
      }
      const city = doc.cities.find((c) => c.id === id);
      if (city?.ll) zoomTo(city.ll, 11.5);
    },
    [cityId, doc.cities, zoomTo],
  );

  /** Zooming from another tab only helps if the map is what you end up looking at. */
  const showOnMap = useCallback(
    (ll: LatLng, zoom: number) => {
      setTab('map');
      zoomTo(ll, zoom);
    },
    [zoomTo],
  );

  /** How many cities have an option made active — the Stay tab's tally. */
  const stayPicked = useMemo(
    () => doc.cities.filter((c) => c.hotels.some((h) => h.id === c.hotelSel)).length,
    [doc.cities],
  );

  const dayEntry = d.schedule[Math.min(Math.max(1, day), Math.max(1, d.schedule.length)) - 1] ?? null;

  /**
   * The planned day as an ordered list of located stops. Only stops get routed —
   * a place that is merely pinned costs nothing.
   */
  const stops = useMemo<Stop[]>(() => {
    if (!dayEntry) return [];
    const city = dayEntry.city;
    const out: Stop[] = [];
    const hotel = selectedHotel(city);
    if (hotel?.ll) {
      out.push({ id: 'hotel:' + hotel.id, label: hotel.name || 'Hotel', ll: hotel.ll, mode: 'walk' });
    }
    dayEntry.items.forEach((it) => {
      const place = city.places.find((p) => p.id === it.placeId);
      if (place?.ll) {
        out.push({ id: it.id, label: it.title || place.name, ll: place.ll, mode: it.mode });
      }
    });
    return out;
  }, [dayEntry]);

  const hops = useDayRoute(tab === 'days' || tab === 'build' ? stops : []);

  const legs = useMemo<MapLeg[]>(() => {
    if (tab !== 'days' && tab !== 'build') return [];
    return hops
      .map((h) => {
        const leg = h.options[h.to.mode] ?? h.options.walk;
        if (!leg) return null;
        return { id: h.toId, mode: leg.mode, geometry: leg.geometry };
      })
      .filter((l): l is MapLeg => !!l);
  }, [hops, tab]);

  const dayCity = dayEntry?.city ?? null;

  const plan = useMemo(
    () =>
      dayEntry
        ? planDay(dayEntry.items, hops, {
            metroFare: dayCity?.metroFare ?? 0,
            travelers: doc.trip.travelers,
          })
        : null,
    [dayEntry, hops, dayCity?.metroFare, doc.trip.travelers],
  );

  /** Where the day currently ends — what the builder routes new stops from. */
  const buildAnchor = useMemo(() => {
    const last = stops[stops.length - 1];
    return last ? { ll: last.ll, label: last.label } : null;
  }, [stops]);

  /** Add a pinned place to the end of the day being built. */
  const addStopFromPlace = useCallback(
    (place: Place) => {
      if (!dayEntry) return;
      const id = store.addDayItem(dayEntry.key);
      store.setDayItem(dayEntry.key, id, 'title', place.name);
      store.setDayItem(dayEntry.key, id, 'placeId', place.id);
      store.setDayItem(dayEntry.key, id, 'dwell', DEFAULT_DWELL[place.kind] ?? 60);
      void uid;
    },
    [dayEntry, store],
  );

  const applyPreset = useCallback(
    (preset: Preset, replace: boolean) => {
      if (!dayEntry || !dayCity) return;
      store.applyPreset(dayCity.id, dayEntry.key, preset, replace);
      setTab('days');
    },
    [dayEntry, dayCity, store],
  );

  /** Map pins: every city, plus the selected city's hotel and places. */
  const pins = useMemo<MapPin[]>(() => {
    const out: MapPin[] = [];
    // Stop numbers come from the day being planned, if any.
    const stopIndex = new Map<string, number>();
    if (tab === 'days' || tab === 'build') {
      stops.forEach((s, i) => stopIndex.set(s.ll.join(','), i + 1));
    }

    doc.cities.forEach((c) => {
      const focused = c.id === cityId;
      if (c.ll) {
        out.push({
          id: c.id,
          name: c.name,
          sub: `${c.nights} ${c.nights === 1 ? 'night' : 'nights'}`,
          ll: c.ll,
          selected: focused,
          kind: 'city',
        });
      }
      // Every located option is pinned, not just the budgeted one — the whole
      // shortlist is what you are comparing on the map.
      if (focused || plotAll) {
        c.hotels.forEach((h) => {
          if (!h.ll || !h.name) return;
          const nightly = Number(h.cost) || 0;
          const pick = h.id === c.hotelSel;
          out.push({
            id: h.id,
            name: h.name,
            sub: nightly ? fmtUsd(nightly) + '/night' : 'stay',
            ll: h.ll,
            selected: false,
            kind: 'hotel',
            icon: 'ph-bed',
            // Only the budgeted option is ever a stop in the planned day.
            stopNumber: pick ? stopIndex.get(h.ll.join(',')) : undefined,
            hotel: {
              city: c.name,
              nightly,
              nights: c.nights,
              total: nightly * c.nights,
              overview: h.overview ?? '',
              images: h.images ?? [],
              url: h.url,
              pick,
            },
          });
        });
      }
      // Every pinned place is plotted — they are only routed once scheduled.
      if (!focused && !plotAll) return;
      c.places.forEach((p) => {
        if (!p.ll || !p.name) return;
        out.push({
          id: p.id,
          name: p.name,
          sub: p.band || p.note,
          ll: p.ll,
          selected: false,
          kind: 'place',
          icon: PLACE_KINDS.find((k) => k.id === p.kind)?.icon ?? 'ph-map-pin',
          stopNumber: stopIndex.get(p.ll.join(',')),
        });
      });
    });
    return out;
  }, [doc.cities, cityId, plotAll, stops, tab]);

  const zoomToPoints = useCallback((points: LatLng[]) => {
    if (!points.length) return;
    fitNonce.current += 1;
    setFocus(null);
    setFit({ points, nonce: fitNonce.current });
  }, []);

  // Each city carries how you got there, so the map can draw flown legs as flights.
  const route = useMemo<RouteStop[]>(
    () =>
      doc.cities
        .filter((c) => !!c.ll)
        .map((c) => ({ ll: c.ll as LatLng, flight: isFlightLeg(c.transitName) })),
    [doc.cities],
  );

  const submitCity = async () => {
    const name = newCity.trim();
    if (!name) return;
    setLocating(true);
    // Geocode first so the pin and the route are right the moment it appears.
    const hit = await geocode(name);
    const id = store.addCity(name, hit ? hitToLatLng(hit) : null);
    setLocating(false);
    setNewCity('');
    setAdding(false);
    setCityId(id);
    if (hit) zoomTo(hitToLatLng(hit), 11.5);
  };

  const cityNotes = useMemo(() => {
    const out: Record<string, number> = {};
    doc.comments.forEach((c) => {
      if (c.city && !c.resolved) out[c.city] = (out[c.city] ?? 0) + 1;
    });
    return out;
  }, [doc.comments]);

  /** The most recent edit anyone made inside a city, for its row outline. */
  const cityTouch = useMemo(() => {
    const out: Record<string, { by: 'conner' | 'anasophia'; at: number }> = {};
    Object.entries(doc.touches).forEach(([path, t]) => {
      const c = path.split('/')[0];
      if (!out[c] || t.at > out[c].at) out[c] = t;
    });
    return out;
  }, [doc.touches]);

  if (!store.ready) return <div style={{ position: 'fixed', inset: 0, background: 'var(--color-bg)' }} />;
  if (!store.user) return <Login onPick={store.signIn} />;

  const me = PEOPLE[store.user];
  const totalWithItems = d.totals.grand + d.totals.activities;
  const planned = doc.trip.planned;
  const segments = (['Lodging', 'Transit', 'Food'] as const).map((k) => {
    const v = k === 'Lodging' ? d.totals.lodging : k === 'Transit' ? d.totals.transit : d.totals.food;
    return { label: k, amount: fmtUsd(v), pct: Math.round((v / (d.totals.grand || 1)) * 100) + '%' };
  });

  return (
    <div
      ref={shell}
      style={{
        position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--color-bg)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header — opaque and in the flow, so nothing sits over the map. */}
      <div
        style={{
          flex: 'none', position: 'relative', zIndex: 9, background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-neutral-900)',
          padding: 'calc(var(--safe-top) + 12px) calc(var(--safe-right) + 16px) 0 calc(var(--safe-left) + 16px)',
        }}
      >
        <div
          className="mono"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5, color: 'var(--color-accent-300)' }}
        >
          <span
            style={{
              width: 5, height: 5, borderRadius: 9999,
              background: 'var(--color-accent-400)', animation: 'blip 2.2s ease-in-out infinite',
            }}
          />
          {doc.trip.travelers} {doc.trip.travelers === 1 ? 'traveler' : 'travelers'}
          {d.schedule.length ? ` · ${d.schedule.length} days` : ' · nothing planned yet'}
          <span style={{ flex: 1 }} />
          {!online ? (
            <span
              className="mono"
              style={{
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 8.5,
                color: 'var(--color-neutral-400)',
              }}
            >
              <i className="ph ph-cloud-slash" style={{ fontSize: 11 }} />
              Offline
            </span>
          ) : null}
          <SaveChip state={store.saveState} error={store.saveState === 'error'} />
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, marginTop: 4, pointerEvents: 'auto',
          }}
        >
          <button
            className="tap"
            onClick={() => {
              setSettings((v) => !v);
              setTab('cities');
            }}
            style={{
              flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
              padding: 0, color: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
            }}
          >
            <span
              style={{
                fontSize: 20, fontWeight: 500, lineHeight: 1.15,
                color: doc.trip.name ? 'var(--color-text)' : 'var(--color-neutral-600)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {doc.trip.name || 'Name this trip'}
            </span>
            <i className="ph ph-caret-down" style={{ fontSize: 12, color: 'var(--color-neutral-600)' }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {PERSON_LIST.map((p) => {
              const on = p.id === me.id;
              return (
                <button
                  key={p.id}
                  className="tap"
                  onClick={() => store.signIn(p.id)}
                  aria-label={'Switch to ' + p.name}
                  aria-pressed={on}
                  title={on ? p.name + ' (you)' : 'Switch to ' + p.name}
                  style={{
                    width: 32, height: 32, borderRadius: 9999, cursor: 'pointer',
                    border: '1.5px solid ' + (on ? p.color : 'var(--color-neutral-800)'),
                    background: on ? p.glow : 'transparent',
                    color: on ? p.color : 'var(--color-neutral-600)',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  {p.initial}
                </button>
              );
            })}
          </div>
        </div>

        {d.schedule.length ? (
          <div
            className="mono"
            style={{ fontSize: 9.5, color: 'var(--color-neutral-400)', marginTop: 5, whiteSpace: 'nowrap' }}
          >
            {fmtD(dateOf(doc.trip.start, 0))} – {fmtD(dateOf(doc.trip.start, d.schedule.length - 1))}
          </div>
        ) : null}

        {/* The running total; the breakdown it opens lives on the Cities tab. */}
        <button
          className="tap"
          onClick={() => setTab('cities')}
          style={{
            width: '100%', marginTop: 9, padding: 0, border: 'none', background: 'none',
            color: 'inherit', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span key={d.totals.grand} className="num" style={{ fontSize: 19, fontWeight: 600, animation: 'countUp .28s ease both' }}>
              {fmtUsd(d.totals.grand)}
            </span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
              {fmtUsd(d.totals.grand / Math.max(1, doc.trip.travelers))} each
            </span>
            <span style={{ flex: 1 }} />
            <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
              {planned
                ? totalWithItems > planned
                  ? fmtUsd(totalWithItems - planned) + ' over plan'
                  : fmtUsd(planned - totalWithItems) + ' left'
                : 'no budget set'}
            </span>
          </div>
          <div
            style={{
              display: 'flex', height: 4, borderRadius: 9999, overflow: 'hidden',
              background: 'var(--color-neutral-900)', marginTop: 7,
            }}
          >
            {segments.map((s) => (
              <div key={s.label} style={{ width: s.pct, background: SEG_FILL[s.label] }} />
            ))}
          </div>
        </button>

        <div className="tab-strip" role="tablist" aria-label="Sections">
          {TABS.map(([id, labelText, icon]) => {
            const on = tab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={on}
                ref={on ? activeTab : undefined}
                className={'tab-btn tap' + (on ? ' is-on' : '')}
                onClick={() => {
                  setTab(id);
                  if (id !== 'map') setFocus(null);
                }}
              >
                <i className={'ph ' + icon} />
                {labelText}
              </button>
            );
          })}
        </div>
      </div>

      {/* Everything below the header is the map, until a tab covers it. */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <TripMap
          pins={pins}
          route={route}
          legs={legs}
          fit={fit}
          sheetPx={mapInset}
          focus={focus}
          onSelect={selectCity}
        />

        {tab === 'map' && d.cities.length === 0 ? (
          <div className="map-empty">
            <div style={{ fontSize: 14, fontWeight: 500 }}>Nothing planned yet</div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', margin: '6px 0 12px', lineHeight: 1.5 }}>
              Add a city and it gets pinned here. Then fill in where you&rsquo;re staying,
              how you&rsquo;re getting there and what you&rsquo;ll do each day.
            </div>
            <button
              className="tap"
              onClick={() => setTab('cities')}
              style={{
                minHeight: 40, padding: '0 16px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-accent-500)', background: 'transparent',
                color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Add a city
            </button>
          </div>
        ) : null}

        {tab === 'map' && d.cities.length > 1 ? (
          <button className="map-toggle tap" onClick={() => setPlotAll((v) => !v)}>
            <i className={plotAll ? 'ph-fill ph-map-pin' : 'ph ph-map-pin'} />
            {plotAll ? 'Every place' : 'Open city only'}
          </button>
        ) : null}

        {tab !== 'map' ? (
          <div
            className="scroll-pane"
            style={{
              position: 'absolute', inset: 0, zIndex: 8, background: 'var(--color-bg)',
              padding: '11px calc(var(--safe-right) + 11px) calc(var(--safe-bottom) + 28px) calc(var(--safe-left) + 11px)',
            }}
          >
{tab === 'cities' ? (
            <>
              {settings ? (
                <TripSettings
                  trip={doc.trip}
                  spent={totalWithItems}
                  onChange={store.setTrip}
                  touch={store.touch}
                  onClose={() => setSettings(false)}
                  onExport={store.exportDoc}
                  onImport={store.importDoc}
                  persisted={store.persisted}
                />
              ) : null}

              {/* Total budget */}
              <div
                style={{
                  marginTop: 12, padding: '11px 13px', pointerEvents: 'auto',
                  background: 'rgba(35,37,50,.92)', border: '1px solid var(--color-neutral-800)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)' }}>Total budget</div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
                    {planned
                      ? totalWithItems > planned
                        ? fmtUsd(totalWithItems - planned) + ' over plan'
                        : fmtUsd(planned - totalWithItems) + ' left of ' + fmtUsd(planned)
                      : 'no budget set'}
                  </div>
                </div>
                <div
                  key={d.totals.grand}
                  className="num"
                  style={{ fontSize: 25, fontWeight: 600, animation: 'countUp .28s ease both' }}
                >
                  {fmtUsd(d.totals.grand)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-neutral-500)' }}>
                  {fmtUsd(d.totals.grand / Math.max(1, doc.trip.travelers))} each
                  {d.totals.activities ? ` · plus ${fmtUsd(d.totals.activities)} of planned items` : ''}
                </div>
                <div
                  style={{
                    display: 'flex', height: 5, borderRadius: 9999, overflow: 'hidden',
                    background: 'var(--color-neutral-900)', margin: '9px 0 7px',
                  }}
                >
                  {segments.map((s) => (
                    <div key={s.label} style={{ width: s.pct, background: SEG_FILL[s.label] }} />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  {segments.map((s) => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: SEG_FILL[s.label] }} />
                      <span className="mono" style={{ fontSize: 10, color: 'var(--color-neutral-500)' }}>
                        {s.label} {s.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {d.cities.length === 0 && !adding ? (
                <div
                  style={{
                    padding: '22px 16px', borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--color-neutral-800)', textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 500 }}>Nothing planned yet</div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', margin: '6px 0 2px', lineHeight: 1.5 }}>
                    Add a city and it gets pinned on the map. Then fill in hotels,
                    how you&rsquo;re getting there, food and what you&rsquo;ll do each day.
                  </div>
                </div>
              ) : null}

              {doc.cities.map((c, i) => (
                <CityRow
                  key={c.id}
                  city={c}
                  index={i}
                  open={cityId === c.id}
                  start={doc.trip.start}
                  startDay={d.span[c.id].start}
                  total={d.spend[c.id].total}
                  notes={cityNotes[c.id] ?? 0}
                  touch={cityTouch[c.id]}
                  onSelect={() => selectCity(c.id)}
                  onMove={(dir) => store.moveCity(c.id, dir)}
                  onRemove={() => store.removeCity(c.id)}
                >
                  <CityPanel
                    city={c}
                    spend={d.spend[c.id]}
                    travelers={doc.trip.travelers}
                    onCity={(key, val) => store.setCity(c.id, key, val)}
                    onOpenStay={() => setTab('stay')}
                    onAddPlace={() => store.addPlace(c.id)}
                    onPlace={(pid, key, val) => store.setPlace(c.id, pid, key, val)}
                    onRemovePlace={(pid) => store.removePlace(c.id, pid)}
                    onZoom={showOnMap}
                    touch={(suffix) => store.touch(`${c.id}/${suffix}`)}
                  />
                </CityRow>
              ))}

              {adding ? (
                <div
                  style={{
                    padding: 11, borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-neutral-800)', background: 'var(--color-surface)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      autoFocus
                      value={newCity}
                      placeholder="City or town"
                      onChange={(e) => setNewCity(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitCity();
                      }}
                      style={{
                        flex: 1, minWidth: 0, minHeight: 44, fontSize: 13,
                        borderBottom: '1px solid var(--color-neutral-700)',
                      }}
                    />
                    <button
                      className="tap"
                      onClick={() => void submitCity()}
                      disabled={locating}
                      style={{
                        flex: 'none', minHeight: 44, padding: '0 15px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--color-accent-500)', background: 'transparent',
                        color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      {locating ? 'Locating…' : 'Add'}
                    </button>
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)', marginTop: 8 }}>
                    Looked up on OpenStreetMap so it lands in the right place
                  </div>
                  <button
                    className="tap"
                    onClick={() => {
                      setAdding(false);
                      setNewCity('');
                    }}
                    style={{
                      width: '100%', marginTop: 10, minHeight: 40, borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-neutral-800)', background: 'transparent',
                      color: 'var(--color-neutral-500)', fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="tap"
                  onClick={() => setAdding(true)}
                  style={{
                    width: '100%', minHeight: 48, marginTop: 8, borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--color-neutral-700)', background: 'transparent',
                    color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer',
                  }}
                >
                  <i className="ph ph-plus" style={{ fontSize: 14 }} />
                  Add a city
                </button>
              )}
            </>
          ) : null}

{tab === 'stay' ? (
            <StayTab
              cities={doc.cities}
              onSetActive={(cid, hid) => store.setCity(cid, 'hotelSel', hid)}
              onHotel={(cid, hid, key, val) => store.setHotel(cid, hid, key, val)}
              onAddHotel={(cid) => store.addHotelSlot(cid)}
              onZoom={showOnMap}
              touch={store.touch}
            />
          ) : null}

          {tab === 'days' ? (
            <DaysTab
              schedule={d.schedule}
              start={doc.trip.start}
              selected={day}
              hops={hops}
              plan={plan}
              fare={dayCity?.metroFare ?? 0}
              travelers={doc.trip.travelers}
              onSelectDay={(n) => {
                setDay(n);
                const c = d.schedule[n - 1]?.city;
                if (c) setCityId(c.id);
              }}
              onAddItem={store.addDayItem}
              onSetItem={store.setDayItem}
              onToggleItem={store.toggleDayItem}
              onRemoveItem={store.removeDayItem}
              onMoveItem={store.moveDayItem}
              onZoomDay={() => {
                setTab('map');
                zoomToPoints(stops.map((s) => s.ll));
              }}
              onZoomStop={(ll) => showOnMap(ll, 16.5)}
            />
          ) : null}

          {tab === 'build' ? (
            <BuilderTab
              day={dayEntry}
              city={dayCity}
              anchor={buildAnchor}
              metroFare={dayCity?.metroFare ?? 0}
              travelers={doc.trip.travelers}
              onApplyPreset={applyPreset}
              onAddStop={addStopFromPlace}
              onSetFare={(f) => dayCity && store.setCity(dayCity.id, 'metroFare', f)}
              onZoom={(ll) => showOnMap(ll, 16)}
            />
          ) : null}

          {tab === 'list' ? (
            <ChecklistTab
              items={doc.checklist}
              onAdd={store.addCheck}
              onSet={store.setCheck}
              onToggle={store.toggleCheck}
              onRemove={store.removeCheck}
              onPrint={() => window.print()}
            />
          ) : null}

          {tab === 'notes' ? (
            <NotesTab
              comments={doc.comments}
              cities={doc.cities.map((c) => ({ id: c.id, name: c.name }))}
              current={cityId}
              onAdd={store.addComment}
              onToggle={store.toggleComment}
              onRemove={store.removeComment}
            />
          ) : null}
          </div>
        ) : null}
      </div>

      <PrintSheet d={d} doc={doc} />
    </div>
  );
}

function CityRow({
  city, index, open, start, startDay, total, notes, touch, onSelect, onMove, onRemove, children,
}: {
  city: City;
  index: number;
  open: boolean;
  start: string;
  startDay: number;
  total: number;
  notes: number;
  touch?: { by: 'conner' | 'anasophia'; at: number };
  onSelect: () => void;
  onMove: (dir: number) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 7 }}>
      <button
        className="tap"
        onClick={onSelect}
        style={{
          width: '100%', minHeight: 56, padding: 14, textAlign: 'left',
          borderRadius: 'var(--radius-md)',
          border: '1px solid ' + (open ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
          background: open ? 'rgba(145,132,217,.10)' : 'var(--color-surface)',
          color: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
          animation: 'riseIn .34s ease both', animationDelay: index * 60 + 'ms',
          ...(touchStyle(touch) ?? {}),
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 500 }}>{city.name}</span>
          {!city.ll ? (
            <span className="mono" style={{ fontSize: 8.5, color: 'var(--color-neutral-600)' }}>
              no coordinates — not on the map
            </span>
          ) : null}
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)', flex: 'none' }}>
          {fmtD(dateOf(start, startDay - 1))} – {fmtD(dateOf(start, startDay + city.nights - 2))}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
          <span className="num" style={{ fontSize: 12 }}>{total ? fmtUsd(total) : '—'}</span>
          <TouchMark touch={touch} align="right" />
        </span>
        {notes ? (
          <span
            className="mono"
            style={{
              fontSize: 8.5, color: 'var(--color-accent-300)', flex: 'none',
              border: '1px solid var(--color-accent-700)', borderRadius: 9999, padding: '2px 6px',
            }}
          >
            {notes}
          </span>
        ) : null}
        <i
          className={open ? 'ph ph-caret-up' : 'ph ph-caret-down'}
          style={{ fontSize: 13, color: 'var(--color-neutral-600)', flex: 'none' }}
        />
      </button>

      {open ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
            <IconBtn icon="ph-arrow-up" label={`Move ${city.name} earlier`} onClick={() => onMove(-1)} />
            <IconBtn icon="ph-arrow-down" label={`Move ${city.name} later`} onClick={() => onMove(1)} />
            <IconBtn icon="ph-trash" label={`Remove ${city.name}`} onClick={onRemove} />
          </div>
          {children}
        </>
      ) : null}
    </div>
  );
}

/** Quiet unless something is wrong — travelers shouldn't have to wonder. */
function SaveChip({ state, error }: { state: string; error: boolean }) {
  if (error) {
    return (
      <span
        className="mono"
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8.5, color: '#ff8fae' }}
        title="This device refused to store the plan. Export a backup from the trip panel."
      >
        <i className="ph ph-warning" style={{ fontSize: 11 }} />
        Not saved
      </span>
    );
  }
  return (
    <span
      className="mono"
      style={{
        display: 'flex', alignItems: 'center', gap: 4, fontSize: 8.5,
        color: 'var(--color-neutral-600)',
        opacity: state === 'saving' ? 1 : 0.65,
        transition: 'opacity .2s ease',
      }}
    >
      <i
        className={state === 'saving' ? 'ph ph-cloud-arrow-up' : 'ph ph-check-circle'}
        style={{ fontSize: 11 }}
      />
      {state === 'saving' ? 'Saving' : 'Saved'}
    </span>
  );
}

function IconBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      className="tap"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 44, height: 44, borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-neutral-800)', background: 'transparent',
        color: 'var(--color-neutral-500)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <i className={'ph ' + icon} style={{ fontSize: 12 }} />
    </button>
  );
}
