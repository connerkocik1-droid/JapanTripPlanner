'use client';

import { DayEntry } from '@/lib/derive';
import { DayItem } from '@/lib/data';
import { dateOf, fmtD, fmtDow, fmtUsd } from '@/lib/format';

export interface DaysTabProps {
  schedule: DayEntry[];
  start: string;
  selected: number;
  onSelectDay: (n: number) => void;
  onAddItem: (key: string) => void;
  onSetItem: <K extends keyof DayItem>(key: string, id: string, field: K, val: DayItem[K]) => void;
  onToggleItem: (key: string, id: string) => void;
  onRemoveItem: (key: string, id: string) => void;
}

export default function DaysTab({
  schedule, start, selected, onSelectDay, onAddItem, onSetItem, onToggleItem, onRemoveItem,
}: DaysTabProps) {
  if (!schedule.length) {
    return (
      <div style={empty}>
        Add a city on the Map tab and its nights show up here as days to fill in.
      </div>
    );
  }

  const day = schedule[Math.min(Math.max(1, selected), schedule.length) - 1];
  const dt = dateOf(start, day.n - 1);
  const total = day.items.reduce((a, it) => a + (Number(it.cost) || 0), 0);

  return (
    <div>
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 2, display: 'flex', gap: 6,
          overflowX: 'auto', padding: '2px 0 10px', background: 'rgba(27,30,46,.97)',
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>{day.city.name}</div>
        <div className="num" style={{ fontSize: 12.5, color: 'var(--color-neutral-400)' }}>
          {total ? fmtUsd(total) : ''}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', margin: '3px 0 12px' }}>
        Day {String(day.n).padStart(2, '0')} / {fmtDow(dt)} {fmtD(dt)} · night {day.nightIndex + 1} of{' '}
        {day.city.nights}
      </div>

      {day.items.length === 0 ? (
        <div style={empty}>Nothing planned for this day yet.</div>
      ) : (
        day.items.map((it, i) => (
          <div
            key={it.id}
            style={{
              display: 'grid', gridTemplateColumns: '58px 18px minmax(0,1fr) auto',
              gap: '0 8px', alignItems: 'start', padding: '6px 0',
              animation: 'riseIn .3s ease both', animationDelay: i * 45 + 'ms',
            }}
          >
            <input
              type="time"
              value={it.time}
              aria-label="Time"
              onChange={(e) => onSetItem(day.key, it.id, 'time', e.target.value)}
              className="mono num"
              style={{
                fontSize: 10, color: 'var(--color-neutral-400)', padding: '11px 0 0',
                background: 'transparent', border: 'none', width: '100%',
              }}
            />
            <button
              className="tap"
              onClick={() => onToggleItem(day.key, it.id)}
              aria-label={it.done ? 'Mark not done' : 'Mark done'}
              aria-pressed={it.done}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                paddingTop: 12, height: '100%',
              }}
            >
              <span
                style={{
                  width: 9, height: 9, borderRadius: 9999,
                  border: '1px solid ' + (it.done ? 'var(--color-accent-500)' : 'var(--color-neutral-600)'),
                  background: it.done ? 'var(--color-accent-500)' : 'var(--color-bg)',
                }}
              />
              <span style={{ flex: 1, width: 1, background: 'var(--color-neutral-800)', marginTop: 4 }} />
            </button>
            <div style={{ minWidth: 0, padding: '6px 0' }}>
              <input
                type="text"
                value={it.title}
                placeholder="What are you doing?"
                onChange={(e) => onSetItem(day.key, it.id, 'title', e.target.value)}
                style={{
                  width: '100%', fontSize: 13.5, fontWeight: 500, height: 26,
                  textDecoration: it.done ? 'line-through' : 'none',
                  color: it.done ? 'var(--color-neutral-600)' : 'var(--color-text)',
                }}
              />
              <input
                type="text"
                value={it.note}
                placeholder="Note"
                onChange={(e) => onSetItem(day.key, it.id, 'note', e.target.value)}
                style={{ width: '100%', fontSize: 11, height: 22, color: 'var(--color-neutral-500)' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingTop: 6 }}>
              <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>$</span>
              <input
                type="number"
                min={0}
                inputMode="decimal"
                value={it.cost || ''}
                placeholder="0"
                aria-label="Cost"
                onChange={(e) => onSetItem(day.key, it.id, 'cost', Number(e.target.value) || 0)}
                className="num"
                style={{ width: 52, fontSize: 11.5, textAlign: 'right' }}
              />
              <button
                className="tap"
                onClick={() => onRemoveItem(day.key, it.id)}
                aria-label="Remove item"
                style={{
                  width: 30, height: 30, border: 'none', background: 'transparent',
                  color: 'var(--color-neutral-700)', cursor: 'pointer',
                }}
              >
                <i className="ph ph-trash" style={{ fontSize: 12 }} />
              </button>
            </div>
          </div>
        ))
      )}

      <button
        className="tap"
        onClick={() => onAddItem(day.key)}
        style={{
          width: '100%', minHeight: 44, marginTop: 10, borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--color-neutral-700)', background: 'transparent',
          color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer',
        }}
      >
        <i className="ph ph-plus" style={{ fontSize: 14 }} />
        Add something to this day
      </button>
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
};
