'use client';

import { Trip } from '@/lib/data';
import { fmtUsd } from '@/lib/format';
import { Touch } from '@/lib/tripState';
import TouchMark from './TouchMark';

export interface TripSettingsProps {
  trip: Trip;
  spent: number;
  onChange: <K extends keyof Trip>(key: K, val: Trip[K]) => void;
  touch: (path: string) => Touch | undefined;
  onClose: () => void;
}

const label = { fontSize: 9.5, color: 'var(--color-neutral-500)' } as const;
const row = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 48,
  borderTop: '1px solid var(--color-neutral-900)',
} as const;

export default function TripSettings({ trip, spent, onChange, touch, onClose }: TripSettingsProps) {
  const left = trip.planned ? trip.planned - spent : 0;
  return (
    <div
      style={{
        padding: '4px 12px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-neutral-800)',
        marginBottom: 10,
        animation: 'fadeIn .22s ease both',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
        <div className="mono" style={label}>Trip</div>
        <button
          className="tap"
          onClick={onClose}
          aria-label="Close trip settings"
          style={{
            width: 34, height: 34, border: 'none', background: 'transparent',
            color: 'var(--color-neutral-500)', cursor: 'pointer',
          }}
        >
          <i className="ph ph-x" style={{ fontSize: 13 }} />
        </button>
      </div>

      <input
        type="text"
        value={trip.name}
        placeholder="Trip name"
        onChange={(e) => onChange('name', e.target.value)}
        style={{ width: '100%', height: 40, fontSize: 16, fontWeight: 500 }}
      />
      <TouchMark touch={touch('trip/name')} />

      <div style={row}>
        <div className="mono" style={{ ...label, flex: 1 }}>Starts</div>
        <input
          type="date"
          value={trip.start}
          aria-label="Trip start date"
          onChange={(e) => onChange('start', e.target.value)}
          className="num"
          style={{
            fontSize: 13, background: 'transparent', border: 'none',
            color: 'var(--color-text)', colorScheme: 'dark',
          }}
        />
      </div>

      <div style={row}>
        <div className="mono" style={{ ...label, flex: 1 }}>Travelers</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="tap"
            aria-label="One traveler fewer"
            onClick={() => onChange('travelers', Math.max(1, trip.travelers - 1))}
            style={mini}
          >
            &minus;
          </button>
          <span className="num" style={{ minWidth: 22, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
            {trip.travelers}
          </span>
          <button
            className="tap"
            aria-label="One traveler more"
            onClick={() => onChange('travelers', Math.min(12, trip.travelers + 1))}
            style={mini}
          >
            +
          </button>
        </div>
      </div>

      <div style={row}>
        <div className="mono" style={{ ...label, flex: 1 }}>Budget</div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>$</span>
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={trip.planned || ''}
          placeholder="0"
          aria-label="Total budget"
          onChange={(e) => onChange('planned', Number(e.target.value) || 0)}
          className="num"
          style={{ width: 96, fontSize: 14, fontWeight: 600, textAlign: 'right' }}
        />
      </div>
      {trip.planned ? (
        <div className="mono num" style={{ ...label, fontSize: 9, textAlign: 'right', marginTop: 4 }}>
          {left >= 0 ? `${fmtUsd(left)} left` : `${fmtUsd(-left)} over`}
        </div>
      ) : null}
    </div>
  );
}

const mini = {
  width: 36, height: 36, borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-neutral-700)', background: 'transparent',
  color: 'var(--color-neutral-300)', fontSize: 13, cursor: 'pointer',
} as const;
