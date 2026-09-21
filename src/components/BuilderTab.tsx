'use client';

import { useEffect, useRef, useState } from 'react';
import { City, DEFAULT_DWELL, PLACE_KINDS, Place, placeKind } from '@/lib/data';
import { DayEntry } from '@/lib/derive';
import { fmtUsd } from '@/lib/format';
import { fmtSpan } from '@/lib/dayPlan';
import { Preset, loadPreset, loadPresetIndex, normalizePreset } from '@/lib/presets';
import { LegOptions, fmtDistance, fmtDuration, routeLeg } from '@/lib/routing';
import { LatLng } from '@/lib/data';

type Source = 'preset' | 'custom';

export interface BuilderTabProps {
  day: DayEntry | null;
  city: City | null;
  /** Where the day currently ends — new stops are routed from here. */
  anchor: { ll: LatLng; label: string } | null;
  metroFare: number;
  travelers: number;
  onApplyPreset: (preset: Preset, replace: boolean) => void;
  onAddStop: (place: Place) => void;
  onSetFare: (fare: number) => void;
  onZoom: (ll: LatLng) => void;
  /** Hand the day over to the map, where stops are picked by tapping them. */
  onStartPlan: () => void;
}

export default function BuilderTab({
  day, city, anchor, metroFare, travelers, onApplyPreset, onAddStop, onSetFare, onZoom, onStartPlan,
}: BuilderTabProps) {
  const [source, setSource] = useState<Source>('custom');
  const [index, setIndex] = useState<{ id: string; name: string; city: string; summary?: string; file: string }[]>([]);
  const [loading, setLoading] = useState(true);
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

  if (!day || !city) {
    return <div style={empty}>Add a city first — the builder fills in one of its days.</div>;
  }

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
    <div>
      <div style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 9999, background: 'var(--color-bg)', marginBottom: 12 }}>
        {(['custom', 'preset'] as Source[]).map((s) => {
          const on = source === s;
          return (
            <button
              key={s}
              className="tap"
              onClick={() => setSource(s)}
              style={{
                flex: 1, minHeight: 40, borderRadius: 9999, border: 'none', cursor: 'pointer',
                background: on ? 'var(--color-accent-800)' : 'transparent',
                color: on ? 'var(--color-accent-100)' : 'var(--color-neutral-500)',
                fontSize: 12.5, fontWeight: 500,
              }}
            >
              {s === 'custom' ? 'Build your own' : 'Presets'}
            </button>
          );
        })}
      </div>

      <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', marginBottom: 8 }}>
        Day {String(day.n).padStart(2, '0')} · {city.name} · {day.items.length}{' '}
        {day.items.length === 1 ? 'stop' : 'stops'}
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

      {source === 'custom' ? (
        <>
          {/* The same day, built by tapping the map instead of this list. */}
          <button
            className="tap"
            onClick={onStartPlan}
            style={{
              width: '100%', minHeight: 44, marginBottom: 10, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-accent-700)', background: 'rgba(145,132,217,.10)',
              color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            <i className="ph ph-path" style={{ fontSize: 14 }} />
            Make a plan on the map
          </button>
          <CustomPicker
            city={city}
            anchor={anchor}
            metroFare={metroFare}
            travelers={travelers}
            onAddStop={onAddStop}
            onZoom={onZoom}
          />
        </>
      ) : (
        <div>
          {loading ? (
            <div style={empty}>Looking for presets…</div>
          ) : forCity.length === 0 ? (
            <div style={empty}>
              No presets for {city.name} yet. Drop day files in <code>public/presets/</code> and
              list them in <code>index.json</code>, or import one below.
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
            <i className="ph ph-upload-simple" style={{ fontSize: 13 }} /> Import a preset file
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
            <div className="mono" style={{ fontSize: 9, color: '#ff8fae', marginTop: 6 }}>{problem}</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Pick from the city's pinned places, each priced and timed from where the day currently ends. */
function CustomPicker({
  city, anchor, metroFare, travelers, onAddStop, onZoom,
}: {
  city: City;
  anchor: { ll: LatLng; label: string } | null;
  metroFare: number;
  travelers: number;
  onAddStop: (place: Place) => void;
  onZoom: (ll: LatLng) => void;
}) {
  const [filter, setFilter] = useState<'all' | Place['kind']>('all');
  const [legs, setLegs] = useState<Record<string, LegOptions>>({});

  const shown = city.places.filter((p) => (filter === 'all' ? true : p.kind === filter));

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
                background: on ? 'rgba(145,132,217,.12)' : 'transparent',
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
          const walk = opt?.walk;
          const transit = opt?.transit;
          const dwell = DEFAULT_DWELL[p.kind];
          return (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Same colour the pin is drawn in, so the list and the map agree. */}
                <i
                  className={'ph ' + placeKind(p.kind).icon}
                  style={{ fontSize: 14, color: placeKind(p.kind).color }}
                />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500 }}>
                  {p.name || 'Unnamed place'}
                </span>
                {p.band ? (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--color-accent-300)' }}>{p.band}</span>
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
                ) : (
                  <>
                    {walk ? (
                      <span style={chip}>
                        <i className="ph ph-person-simple-walk" style={{ fontSize: 11 }} />
                        <span className="num">{fmtDuration(walk.seconds)}</span>
                        <span className="mono num" style={{ fontSize: 8, opacity: 0.7 }}>
                          {fmtDistance(walk.meters)}
                        </span>
                        <span className="mono" style={{ fontSize: 8, opacity: 0.7 }}>free</span>
                      </span>
                    ) : null}
                    {transit ? (
                      <span style={chip}>
                        <i className="ph ph-train-simple" style={{ fontSize: 11 }} />
                        <span className="num">{fmtDuration(transit.seconds)}</span>
                        <span className="mono num" style={{ fontSize: 8, opacity: 0.7 }}>
                          {metroFare ? fmtUsd(metroFare * Math.max(1, travelers)) : 'fare?'}
                        </span>
                        {transit.estimated ? (
                          <span className="mono" style={{ fontSize: 7.5, opacity: 0.7 }}>EST</span>
                        ) : null}
                      </span>
                    ) : null}
                  </>
                )}
                <span style={{ flex: 1 }} />
                <span className="mono" style={{ fontSize: 8.5, color: 'var(--color-neutral-600)' }}>
                  {fmtSpan(dwell)} there
                </span>
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
