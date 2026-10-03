'use client';

import { useEffect, useRef, useState } from 'react';
import { City, PLACE_KINDS, Place, placeKind } from '@/lib/data';
import { fmtUsd } from '@/lib/format';
import { Preset, loadPreset, loadPresetIndex, normalizePreset } from '@/lib/presets';
import { LegOptions, fmtDistance, fmtDuration, routeLeg } from '@/lib/routing';
import { LatLng } from '@/lib/data';
import { Local } from './CityMoney';
import type { Rates } from '@/lib/money';
import { WEEKDAYS_LONG, shutOn } from '@/lib/hours';
import { bandRest, legToShow, photoOf, priceTier, ratingOf } from '@/lib/placeCard';
import { orderPlaces } from '@/lib/placeOrder';
import { clashFor as clashAt } from '@/lib/hours';
import MoodLens from './MoodLens';
import type { Answers } from '../../supabase/functions/draft-day/questions';

export interface DayFillProps {
  city: City | null;
  /** Where the day currently ends — new stops are routed from here. */
  anchor: { ll: LatLng; label: string } | null;
  metroFare: number;
  travelers: number;
  /** The day's exchange rates, for what a fare comes to at the gate. */
  rates: Rates | null;
  /** The weekday the day being filled falls on, for marking what is shut. */
  weekday: number;
  /** Places already in this day, which are not what it needs more of. */
  inDay: string[];
  /** What kinds those are, so the day's gaps can be seen. */
  inDayKinds: string[];
  /** Minutes past midnight the day currently ends at, for what is open then. */
  endMins: number | null;
  /** What each traveler does not eat, for the mood's own filtering. */
  diets: Record<string, string>;
  /** The mood this list is being read through, and how to change it. */
  lens: Answers;
  onLens: (next: Answers) => void;
  /** Places in some other day of the trip — still ideas, just not new ones. */
  elsewhere: string[];
  onApplyPreset: (preset: Preset, replace: boolean) => void;
  onAddStop: (place: Place) => void;
  /** A stop that is not one of the city's pinned places — typed in by hand. */
  onAddBlank: () => void;
  onSetFare: (fare: number) => void;
  onZoom: (ll: LatLng) => void;
  /** Hand the day over to the map, where stops are picked by tapping them. */
  onStartPlan: () => void;
}

/**
 * The ways of putting a stop into the day you are looking at.
 *
 * This used to be its own Build tab, one tab away from the day it filled, so
 * planning a day meant going back and forth between two tabs that each showed
 * half of it. It now sits under the day itself: the itinerary above, and every
 * way of adding to it here.
 */
export default function DayFill({
  city, anchor, metroFare, travelers, rates, weekday, inDay, inDayKinds, elsewhere,
  endMins, diets, lens, onLens,
  onApplyPreset, onAddStop, onAddBlank, onSetFare, onZoom, onStartPlan,
}: DayFillProps) {
  const [index, setIndex] = useState<{ id: string; name: string; city: string; summary?: string; file: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const file = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let live = true;
    loadPresetIndex().then((list) => {
      if (!live) return;
      setIndex(list);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!city) return null;

  const forCity = index.filter(
    (p) => !p.city || p.city.toLowerCase() === city.name.toLowerCase(),
  );

  const use = async (fileName: string, replace: boolean) => {
    setBusy(fileName);
    const preset = await loadPreset(fileName);
    setBusy(null);
    if (!preset) {
      setProblem('That preset could not be loaded.');
      return;
    }
    setProblem('');
    onApplyPreset(preset, replace);
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', marginBottom: 8 }}>
        Add to this day
      </div>

      <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
        <button className="tap" onClick={onStartPlan} style={{ ...pill, flex: 1, minHeight: 44, background: 'var(--tint-accent)' }}>
          <i className="ph ph-path" style={{ fontSize: 14 }} />
          Plan on the map
        </button>
        <button
          className="tap"
          onClick={onAddBlank}
          style={{ ...pill, flex: 1, minHeight: 44, borderColor: 'var(--color-neutral-700)', color: 'var(--color-neutral-400)' }}
        >
          <i className="ph ph-plus" style={{ fontSize: 14 }} />
          Something else
        </button>
      </div>

      {/* Fares price every metro leg of the day. */}
      <div style={fareRow}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', flex: 1 }}>
          Metro fare here
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--color-neutral-600)' }}>$</span>
        <input
          type="number"
          min={0}
          step={0.1}
          inputMode="decimal"
          value={metroFare || ''}
          placeholder="0"
          aria-label="Metro fare per person"
          onChange={(e) => onSetFare(Number(e.target.value) || 0)}
          className="num"
          style={{ width: 62, fontSize: 13, fontWeight: 500, textAlign: 'right' }}
        />
        <span className="mono" style={{ fontSize: 8.5, color: 'var(--color-neutral-600)' }}>
          / person
        </span>
      </div>
      {/* What that fare actually reads as on the machine you buy it from. */}
      <div style={{ marginTop: -6, marginBottom: 10 }}>
        <Local usd={metroFare} city={city} rates={rates} />
      </div>

      <CustomPicker
        city={city}
        anchor={anchor}
        weekday={weekday}
        inDay={inDay}
        inDayKinds={inDayKinds}
        elsewhere={elsewhere}
        endMins={endMins}
        diets={diets}
        lens={lens}
        onLens={onLens}
        metroFare={metroFare}
        travelers={travelers}
        onAddStop={onAddStop}
        onZoom={onZoom}
      />

      {/* A whole day someone else worked out. Folded away, because most days
          are built a stop at a time from the list above. */}
      <button
        className="tap"
        onClick={() => setPresetsOpen((v) => !v)}
        style={{
          width: '100%', minHeight: 40, marginTop: 12, borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-neutral-800)', background: 'transparent',
          color: 'var(--color-neutral-400)', fontSize: 11.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <i className={presetsOpen ? 'ph ph-caret-up' : 'ph ph-caret-down'} style={{ fontSize: 12 }} />
        Ready-made days
      </button>

      {presetsOpen ? (
        <div style={{ marginTop: 8 }}>
          {loading ? (
            <div style={empty}>Looking for ready-made days…</div>
          ) : forCity.length === 0 ? (
            <div style={empty}>
              No ready-made days for {city.name} yet. Import one below, or drop day files in{' '}
              <code>public/presets/</code> and list them in <code>index.json</code>.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 7 }}>
              {forCity.map((p) => (
                <div key={p.id} style={card}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{p.name}</div>
                  {p.summary ? (
                    <div style={{ fontSize: 11.5, color: 'var(--color-neutral-500)', marginTop: 3 }}>
                      {p.summary}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      className="tap"
                      disabled={busy === p.file}
                      onClick={() => void use(p.file, false)}
                      style={{ ...pill, flex: 1 }}
                    >
                      {busy === p.file ? 'Loading…' : 'Add to this day'}
                    </button>
                    <button
                      className="tap"
                      disabled={busy === p.file}
                      onClick={() => void use(p.file, true)}
                      style={{ ...pill, flex: 1, color: 'var(--color-neutral-400)' }}
                    >
                      Replace day
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="tap" onClick={() => file.current?.click()} style={{ ...pill, width: '100%', marginTop: 10 }}>
            <i className="ph ph-upload-simple" style={{ fontSize: 13 }} /> Import a day file
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const preset = normalizePreset(JSON.parse(await f.text()));
                if (!preset) throw new Error('That file is not a preset day.');
                setProblem('');
                onApplyPreset(preset, false);
              } catch (err) {
                setProblem(err instanceof Error ? err.message : 'Could not read that file.');
              }
            }}
          />
          {problem ? (
            <div className="mono" style={{ fontSize: 9, color: 'var(--color-danger)', marginTop: 6 }}>{problem}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Pick from the city's pinned places, each priced and timed from where the day currently ends. */
function CustomPicker({
  city, anchor, weekday, inDay, inDayKinds, elsewhere, endMins, diets, lens, onLens,
  metroFare, travelers, onAddStop, onZoom,
}: {
  city: City;
  anchor: { ll: LatLng; label: string } | null;
  weekday: number;
  inDay: string[];
  inDayKinds: string[];
  elsewhere: string[];
  endMins: number | null;
  diets: Record<string, string>;
  lens: Answers;
  onLens: (next: Answers) => void;
  metroFare: number;
  travelers: number;
  onAddStop: (place: Place) => void;
  onZoom: (ll: LatLng) => void;
}) {
  const [filter, setFilter] = useState<'all' | Place['kind']>('all');
  const [legs, setLegs] = useState<Record<string, LegOptions>>({});

  // A place ruled out is not offered as a stop; a maybe still is, because
  // deciding it by putting it in a day is exactly how a maybe gets settled.
  const { list: shown, hidden } = orderPlaces(
    city.places.filter((p) => p.vote !== 'no' && (filter === 'all' ? true : p.kind === filter)),
    {
      seconds: Object.fromEntries(Object.entries(legs).map(([id, o]) => [id, o?.walk?.seconds])),
      weekday,
      inDay,
      inDayKinds,
      elsewhere,
      endMins,
      diets,
      lens,
      shutAt: (place, at) => clashAt(place, weekday, at, at + 60)?.weight === 'hard',
    },
  );

  // Cost and time for adding each candidate, from the day's current end.
  useEffect(() => {
    if (!anchor) {
      setLegs({});
      return;
    }
    let live = true;
    (async () => {
      const entries = await Promise.all(
        city.places
          .filter((p) => p.ll)
          .map(async (p) => [p.id, await routeLeg(anchor.ll, p.ll as LatLng)] as const),
      );
      if (live) setLegs(Object.fromEntries(entries));
    })();
    return () => {
      live = false;
    };
  }, [anchor?.ll[0], anchor?.ll[1], city.places, anchor]);

  if (!city.places.length) {
    return (
      <div style={empty}>
        Pin some restaurants and activities on the Map tab first. They show up here to
        drop into the day.
      </div>
    );
  }

  return (
    <div>
      <MoodLens lens={lens} hidden={hidden} onChange={onLens} />

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
        {(['all', ...PLACE_KINDS.map((k) => k.id)] as const).map((k) => {
          const on = filter === k;
          const label = k === 'all' ? 'All' : PLACE_KINDS.find((x) => x.id === k)?.label ?? k;
          return (
            <button
              key={k}
              className="tap"
              onClick={() => setFilter(k as 'all' | Place['kind'])}
              style={{
                minHeight: 32, padding: '0 11px', borderRadius: 9999, cursor: 'pointer', fontSize: 11,
                border: '1px solid ' + (on ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                background: on ? 'var(--tint-accent)' : 'transparent',
                color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {anchor ? (
        <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)', marginBottom: 7 }}>
          Times and fares from {anchor.label}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 6 }}>
        {shown.map((p) => {
          const opt = legs[p.id];
          const shot = photoOf(p);
          const rated = ratingOf(p);
          const tier = priceTier(p.band);
          const rest = bandRest(p.band);
          // One way of getting there, not two.
          const leg = legToShow(opt);
          return (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {shot ? (
                  // A dead URL shouldn't leave a broken-image box in the list.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    style={{
                      flex: 'none', width: 34, height: 34, objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  />
                ) : (
                  /* Same colour the pin is drawn in, so the list and the map agree. */
                  <i
                    className={'ph ' + placeKind(p.kind).icon}
                    style={{ fontSize: 14, color: placeKind(p.kind).color }}
                  />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500 }}>
                    {p.name || 'Unnamed place'}
                  </span>
                  {/* Only what is actually known about it. */}
                  {rated || tier || p.cuisine.trim() || rest ? (
                    <span
                      className="mono"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                        fontSize: 8.5, color: 'var(--color-neutral-500)', marginTop: 2,
                      }}
                    >
                      {rated ? (
                        <span className="num" style={{ color: 'var(--color-accent-300)' }}>
                          {rated.score}★{rated.count ? ' · ' + rated.count : ''}
                        </span>
                      ) : null}
                      {tier ? <span>{tier}</span> : null}
                      {p.cuisine.trim() ? <span>{p.cuisine.trim()}</span> : null}
                      {rest ? <span>{rest}</span> : null}
                    </span>
                  ) : null}
                </span>
                {/* Said here rather than after it is added: the point is not to
                    add it to a day it is shut on in the first place. */}
                {shutOn(p, weekday) ? (
                  <span
                    className="mono"
                    style={{
                      flex: 'none', fontSize: 8.5, padding: '2px 6px', borderRadius: 9999,
                      border: '1px solid var(--color-danger)', color: 'var(--color-danger)',
                    }}
                  >
                    Shut {WEEKDAYS_LONG[weekday]}
                  </span>
                ) : null}
                <button
                  className="tap"
                  onClick={() => p.ll && onZoom(p.ll)}
                  disabled={!p.ll}
                  aria-label="Show on map"
                  style={{
                    width: 32, height: 32, border: 'none', background: 'transparent', cursor: 'pointer',
                    color: p.ll ? 'var(--color-accent-300)' : 'var(--color-neutral-800)',
                  }}
                >
                  <i className="ph ph-map-pin" style={{ fontSize: 13 }} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {!p.ll ? (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-700)' }}>
                    No coordinates — add an address to route it
                  </span>
                ) : !opt ? (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-700)' }}>
                    {anchor ? 'Checking…' : 'First stop of the day'}
                  </span>
                ) : leg ? (
                  <span style={chip}>
                    <i
                      className={'ph ' + (leg.kind === 'walk' ? 'ph-person-simple-walk' : 'ph-train-simple')}
                      style={{ fontSize: 11 }}
                    />
                    <span className="num">{fmtDuration(leg.seconds)}</span>
                    {leg.kind === 'walk' ? (
                      <span className="mono num" style={{ fontSize: 8, opacity: 0.7 }}>
                        {fmtDistance(leg.meters)}
                      </span>
                    ) : metroFare ? (
                      // Only a fare that is actually known; a guess at the gate
                      // price is worse than no number at all.
                      <span className="mono num" style={{ fontSize: 8, opacity: 0.7 }}>
                        {fmtUsd(metroFare * Math.max(1, travelers))}
                      </span>
                    ) : null}
                  </span>
                ) : null}
                <span style={{ flex: 1 }} />
                <button className="tap" onClick={() => onAddStop(p)} style={{ ...pill, minWidth: 74 }}>
                  <i className="ph ph-plus" style={{ fontSize: 12 }} /> Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const empty = {
  padding: 18,
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--color-neutral-800)',
  color: 'var(--color-neutral-600)',
  fontSize: 12.5,
  textAlign: 'center' as const,
  lineHeight: 1.5,
};

const card = {
  padding: '10px 11px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-surface)',
};

const pill = {
  minHeight: 34,
  padding: '0 12px',
  borderRadius: 9999,
  border: '1px solid var(--color-accent-600)',
  background: 'transparent',
  color: 'var(--color-accent-200)',
  fontSize: 11.5,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const chip = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  minHeight: 26,
  padding: '0 8px',
  borderRadius: 9999,
  border: '1px solid var(--color-neutral-800)',
  color: 'var(--color-neutral-300)',
  fontSize: 10.5,
};

const fareRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '0 11px',
  marginBottom: 10,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-surface)',
};
