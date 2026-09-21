'use client';

import { useEffect, useRef, useState } from 'react';
import { LatLng, Place } from '@/lib/data';
import { GeocodeHit, geocodeQueue, hitToLatLng, isApprox, precisionNote } from '@/lib/geocode';
import { PackListing, loadPack, loadPackIndex, packPlaceToPlace, packsFor } from '@/lib/placePacks';
import { ghostBtn, label } from './fields';

export interface PlacePacksProps {
  cityName: string;
  /** Show the lists straight away, for a city that has nothing pinned yet. */
  startOpen?: boolean;
  /** Pins the lot, skipping names already there, and says what it actually added. */
  onAdd: (places: Place[]) => Place[];
  onLocate: (placeId: string, ll: LatLng) => void;
}

/** One entry that landed somewhere vaguer than its own front door. */
interface Doubt {
  name: string;
  why: string;
}

interface Progress {
  packId: string;
  /** How many addresses have come back so far, of how many. */
  done: number;
  total: number;
  /** Names already pinned, which the import left alone. */
  skipped: number;
  located: number;
  doubts: Doubt[];
  finished: boolean;
}

/**
 * Importing a shortlist of places.
 *
 * The addresses are resolved one at a time rather than trusted: the pack says
 * where somewhere is in words, and the app's own geocoder turns that into a
 * pin, so a restaurant whose address only matches its district is reported as
 * such instead of quietly landing in the middle of Mapo.
 */
export default function PlacePacks({ cityName, startOpen = false, onAdd, onLocate }: PlacePacksProps) {
  const [index, setIndex] = useState<PackListing[]>([]);
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  // Set when the panel closes or the city changes, so a long queue stops.
  const run = useRef<{ cancelled: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    void loadPackIndex().then((list) => live && setIndex(list));
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (run.current) run.current.cancelled = true;
    },
    [],
  );

  const mine = packsFor(index, cityName);
  if (!mine.length) return null;

  const pin = async (listing: PackListing) => {
    setBusy(listing.id);
    setProblem('');
    const pack = await loadPack(listing.file);
    if (!pack) {
      setBusy(null);
      setProblem('That list could not be loaded.');
      return;
    }
    const added = onAdd(pack.places.map(packPlaceToPlace));
    const skipped = pack.places.length - added.length;
    setBusy(null);
    if (!added.length) {
      setProgress({
        packId: listing.id, done: 0, total: 0, skipped, located: 0, doubts: [], finished: true,
      });
      return;
    }

    if (run.current) run.current.cancelled = true;
    const signal = { cancelled: false };
    run.current = signal;
    setProgress({
      packId: listing.id, done: 0, total: added.length, skipped, located: 0, doubts: [], finished: false,
    });

    await geocodeQueue(
      added,
      (p) => p.addr,
      (place: Place, hit: GeocodeHit | null) => {
        if (hit) onLocate(place.id, hitToLatLng(hit));
        const doubt = doubtOf(place, hit);
        setProgress((cur) =>
          cur && cur.packId === listing.id
            ? {
                ...cur,
                done: cur.done + 1,
                located: cur.located + (hit ? 1 : 0),
                doubts: doubt ? [...cur.doubts, doubt] : cur.doubts,
              }
            : cur,
        );
      },
      { signal },
    );
    if (signal.cancelled) return;
    setProgress((cur) => (cur && cur.packId === listing.id ? { ...cur, finished: true } : cur));
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button
        className="tap"
        onClick={() => setOpen((v) => !v)}
        style={{ ...ghostBtn, marginTop: 0 }}
        aria-expanded={open}
      >
        <i className={'ph ' + (open ? 'ph-caret-up' : 'ph-list-plus')} style={{ fontSize: 12 }} />
        {open ? 'Hide ready-made lists' : `Add a ready-made list (${mine.length})`}
      </button>

      {open ? (
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {mine.map((p) => {
            const state = progress?.packId === p.id ? progress : null;
            return (
              <div
                key={p.id}
                style={{
                  padding: '9px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-neutral-800)',
                  background: 'var(--color-surface)',
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{p.name}</div>
                {p.summary ? (
                  <div style={{ fontSize: 11, color: 'var(--color-neutral-500)', marginTop: 2 }}>
                    {p.summary}
                  </div>
                ) : null}

                {state ? (
                  <PackReport state={state} />
                ) : (
                  <button
                    className="tap"
                    disabled={busy === p.id}
                    onClick={() => void pin(p)}
                    style={{
                      width: '100%', minHeight: 36, marginTop: 8, borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-accent-600)', background: 'transparent',
                      color: 'var(--color-accent-200)', fontSize: 11.5, cursor: 'pointer',
                    }}
                  >
                    {busy === p.id
                      ? 'Loading…'
                      : `Pin ${p.count ?? 'them'} ${p.count === 1 ? 'place' : 'places'}`}
                  </button>
                )}
              </div>
            );
          })}
          {problem ? (
            <div className="mono" style={{ fontSize: 9, color: '#ff8fae' }}>{problem}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Why a pin is not where its address says, when it is not. */
function doubtOf(place: Place, hit: GeocodeHit | null): Doubt | null {
  if (!hit) return { name: place.name, why: 'no match for the address' };
  return isApprox(hit) ? { name: place.name, why: precisionNote(hit) } : null;
}

/** What the import is doing, and what it wants a second look at. */
function PackReport({ state }: { state: Progress }) {
  if (!state.total && state.finished) {
    return (
      <div className="mono" style={{ ...label, marginTop: 8 }}>
        Already pinned — nothing new to add.
      </div>
    );
  }
  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 3, borderRadius: 9999, background: 'var(--color-neutral-900)', overflow: 'hidden' }}>
        <div
          style={{
            width: pct + '%', height: '100%', background: 'var(--color-accent-500)',
            transition: 'width .25s ease',
          }}
        />
      </div>
      <div className="mono num" style={{ ...label, marginTop: 5 }}>
        {state.finished
          ? `${state.located} of ${state.total} located` + (state.skipped ? ` · ${state.skipped} already pinned` : '')
          : `Finding addresses… ${state.done} of ${state.total}`}
      </div>
      {state.doubts.length ? (
        <div style={{ marginTop: 6 }}>
          <div className="mono" style={{ ...label, color: '#ffc46b' }}>
            {state.doubts.length} to check
          </div>
          <ul style={{ margin: '3px 0 0', padding: '0 0 0 12px' }}>
            {state.doubts.map((d) => (
              <li key={d.name} style={{ fontSize: 10.5, color: 'var(--color-neutral-500)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--color-neutral-300)' }}>{d.name}</span> — {d.why}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
