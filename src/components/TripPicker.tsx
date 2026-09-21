'use client';

import { useState } from 'react';
import { Person } from '@/lib/people';
import { TripRef } from '@/lib/trips';

/**
 * Which trip you are planning, asked once after you say who you are.
 *
 * A device that has never seen a trip used to start a blank one silently,
 * which reads as the plan having been lost. This asks instead: open one that
 * exists, or start a new one deliberately.
 */
export default function TripPicker({
  person, trips, loading, onOpen, onCreate, onJoin, onBack,
}: {
  person: Person;
  trips: TripRef[];
  /** True while the list is still being gathered, so an empty list is not final. */
  loading: boolean;
  onOpen: (code: string) => void;
  onCreate: () => void;
  onJoin: (short: string) => Promise<boolean>;
  onBack: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [joining, setJoining] = useState(false);
  const [problem, setProblem] = useState('');

  const join = async () => {
    const short = typed.trim();
    if (short.length < 4 || joining) return;
    setJoining(true);
    setProblem('');
    const ok = await onJoin(short);
    if (!ok) {
      setProblem('No trip has that code.');
      setJoining(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'radial-gradient(70% 50% at 50% 30%, #1d2034 0%, #101220 70%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 9.5, color: person.color }}>
          {person.name}
        </div>
        <div style={{ fontSize: 22, fontWeight: 500, marginTop: 6 }}>Which trip?</div>
      </div>

      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          width: '100%', maxWidth: 340,
        }}
      >
        {trips.map((t) => (
          <button
            key={t.code}
            className="tap"
            onClick={() => onOpen(t.code)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              minHeight: 52, padding: '0 14px', textAlign: 'left',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-neutral-800)',
              background: 'rgba(255,255,255,.03)',
              color: 'inherit', cursor: 'pointer', fontSize: 14,
            }}
          >
            <i className="ph ph-map-trifold" style={{ fontSize: 16, color: person.color }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.name || 'Untitled trip'}
            </span>
            <i className="ph ph-caret-right" style={{ fontSize: 13, color: 'var(--color-neutral-600)' }} />
          </button>
        ))}

        {loading && !trips.length ? (
          <div
            className="mono"
            style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', textAlign: 'center', padding: '14px 0' }}
          >
            Looking for your trips…
          </div>
        ) : null}

        {!loading && !trips.length ? (
          <div
            className="mono"
            style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', textAlign: 'center', padding: '10px 0', lineHeight: 1.6 }}
          >
            No trips on this device yet.
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              setProblem('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void join();
            }}
            placeholder="Trip code"
            inputMode="text"
            autoComplete="off"
            style={{
              flex: 1, minWidth: 0, minHeight: 52, padding: '0 14px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-neutral-800)',
              background: 'rgba(255,255,255,.03)',
              color: 'inherit', fontSize: 14,
            }}
          />
          <button
            className="tap"
            onClick={() => void join()}
            disabled={typed.trim().length < 4 || joining}
            style={{
              flex: '0 0 auto', minHeight: 52, padding: '0 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid ' + person.color,
              background: person.glow,
              color: person.color, fontSize: 14,
              cursor: typed.trim().length < 4 || joining ? 'default' : 'pointer',
              opacity: typed.trim().length < 4 ? 0.45 : 1,
            }}
          >
            {joining ? 'Opening…' : 'Open'}
          </button>
        </div>

        {problem ? (
          <div className="mono" style={{ fontSize: 9.5, color: '#ff8fae', textAlign: 'center' }}>
            {problem}
          </div>
        ) : null}

        <button
          className="tap"
          onClick={onCreate}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            minHeight: 52, marginTop: 4,
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--color-neutral-700)',
            background: 'transparent',
            color: 'var(--color-neutral-300)', cursor: 'pointer', fontSize: 14,
          }}
        >
          <i className="ph ph-plus" style={{ fontSize: 15 }} />
          Create a new trip
        </button>
      </div>

      <button
        className="tap"
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-neutral-600)', fontSize: 11,
        }}
      >
        Not {person.name}?
      </button>
    </div>
  );
}
