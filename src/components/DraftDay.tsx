'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { City, DayItem, placeKind } from '@/lib/data';
import { fmtSpan } from '@/lib/dayPlan';
import { Suggestion, draftDay, draftingConfigured, itemsFrom } from '@/lib/draftDay';

export interface DraftDayProps {
  /** The trip's own code — the only thing that gets the server to answer. */
  code: string | null;
  /** `cityId:nightIndex`, the day being drafted. */
  dayKey: string;
  city: City;
  /** Hand the accepted stops to the day. Nothing is saved before this runs. */
  onAccept: (items: DayItem[]) => void;
}

/**
 * "Draft this day": Claude lays out an empty day from the places already
 * pinned to the city, and the suggestions arrive one card at a time.
 *
 * Every card is a suggestion and reads as one — dashed, not solid, the way
 * every other "nothing here yet" box in the app does. None of it is in the
 * plan until somebody accepts it, so dismissing the lot leaves the day exactly
 * as empty as it was.
 */
export default function DraftDay({ code, dayKey, city, onAccept }: DraftDayProps) {
  const [stops, setStops] = useState<Suggestion[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [problem, setProblem] = useState('');
  const [finished, setFinished] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // A draft belongs to the day it was asked for; moving to another day throws
  // it away rather than offering yesterday's stops for tomorrow.
  useEffect(() => {
    setStops([]);
    setProblem('');
    setFinished(false);
    setDrafting(false);
    abort.current?.abort();
    abort.current = null;
  }, [dayKey]);

  useEffect(() => () => abort.current?.abort(), []);

  const start = useCallback(async () => {
    if (!code) {
      setProblem('This trip has no code yet, so there is nothing to draft against.');
      return;
    }
    const ctrl = new AbortController();
    abort.current?.abort();
    abort.current = ctrl;

    setStops([]);
    setProblem('');
    setFinished(false);
    setDrafting(true);

    await draftDay(
      code,
      dayKey,
      city.places,
      {
        onStop: (stop) => setStops((cur) => [...cur, stop].sort(byTime)),
        onDone: (count) => {
          setDrafting(false);
          setFinished(true);
          if (!count) setProblem('Nothing came back worth suggesting for this day.');
        },
        onError: (message) => {
          setDrafting(false);
          setFinished(true);
          setProblem(message);
        },
      },
      ctrl.signal,
    );
  }, [code, dayKey, city.places]);

  const accept = (chosen: Suggestion[]) => {
    const items = itemsFrom(chosen, city.places);
    if (!items.length) return;
    onAccept(items);
    const used = new Set(chosen.map((s) => s.id));
    setStops((cur) => cur.filter((s) => !used.has(s.id)));
  };

  if (!draftingConfigured()) return null;

  const idle = !drafting && !stops.length;

  return (
    <div style={{ marginTop: 14 }}>
      {idle ? (
        <button
          className="tap"
          onClick={start}
          style={{ ...pill, width: '100%', minHeight: 44, background: 'var(--tint-accent)' }}
        >
          <i className="ph ph-sparkle" style={{ fontSize: 14 }} />
          Draft this day
        </button>
      ) : null}

      {drafting ? (
        <div className="mono" style={note}>
          <i className="ph ph-sparkle" style={{ fontSize: 12 }} />
          Drafting {city.name}
          {stops.length ? ` · ${stops.length} so far` : '…'}
        </div>
      ) : null}

      {stops.length ? (
        <>
          <div className="mono" style={heading}>
            Suggested · nothing is saved until you accept it
          </div>

          {stops.map((s) => {
            const place = city.places.find((p) => p.id === s.placeId);
            if (!place) return null;
            const kind = placeKind(place.kind);
            return (
              <div key={s.id} style={suggested}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--color-accent-300)' }}>
                    {s.startTime}
                  </span>
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{place.name}</span>
                  <i className={`ph ${kind.icon}`} style={{ fontSize: 13, color: kind.color }} />
                </div>

                <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', marginTop: 3 }}>
                  {fmtSpan(s.durationMin)} here
                </div>

                {s.reason ? (
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginTop: 6, lineHeight: 1.45 }}>
                    {s.reason}
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                  <button className="tap" onClick={() => accept([s])} style={{ ...pill, flex: 1 }}>
                    <i className="ph ph-check" style={{ fontSize: 12 }} />
                    Accept
                  </button>
                  <button
                    className="tap"
                    onClick={() => setStops((cur) => cur.filter((x) => x.id !== s.id))}
                    style={{ ...pill, flex: 1, borderColor: 'var(--color-neutral-700)', color: 'var(--color-neutral-400)' }}
                  >
                    <i className="ph ph-x" style={{ fontSize: 12 }} />
                    Dismiss
                  </button>
                </div>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
            <button
              className="tap"
              onClick={() => accept(stops)}
              style={{ ...pill, flex: 1, minHeight: 44, background: 'var(--tint-accent)' }}
            >
              <i className="ph ph-check-circle" style={{ fontSize: 14 }} />
              Accept all {stops.length}
            </button>
            <button
              className="tap"
              onClick={() => setStops([])}
              style={{ ...pill, minHeight: 44, borderColor: 'var(--color-neutral-700)', color: 'var(--color-neutral-400)' }}
            >
              Dismiss all
            </button>
          </div>
        </>
      ) : null}

      {problem ? (
        <div style={{ ...note, color: 'var(--color-warn)', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11.5 }}>{problem}</span>
          {finished ? (
            <button
              className="tap"
              onClick={start}
              style={{ ...pill, minHeight: 30, fontSize: 10.5 }}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function byTime(a: Suggestion, b: Suggestion): number {
  return a.startTime.localeCompare(b.startTime);
}

/**
 * Dashed, so a suggestion never reads as part of the plan. The app already
 * uses a dashed border for a box with nothing in it yet, which is exactly what
 * a day with only suggestions in it is.
 */
const suggested = {
  padding: '11px 12px',
  marginBottom: 8,
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--color-accent-600)',
  background: 'transparent',
};

const heading = {
  fontSize: 9.5,
  color: 'var(--color-neutral-500)',
  margin: '2px 0 8px',
};

const note = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 38,
  padding: '0 11px',
  marginTop: 8,
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--color-neutral-800)',
  color: 'var(--color-neutral-500)',
  fontSize: 10.5,
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
