'use client';

import { DayView } from '@/lib/derive';

export interface DaysTabProps {
  days: { n: number; dow: string }[];
  selected: number;
  view: DayView;
  onSelectDay: (n: number) => void;
  onToggleItem: (key: string) => void;
}

export default function DaysTab({ days, selected, view, onSelectDay, onToggleItem }: DaysTabProps) {
  return (
    <div>
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          padding: '2px 0 10px',
          background: 'rgba(27,30,46,.97)',
        }}
      >
        {days.map((d) => {
          const on = d.n === selected;
          return (
            <button
              key={d.n}
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
              <span className="mono" style={{ fontSize: 8.5 }}>{d.dow}</span>
            </button>
          );
        })}
      </div>

      <div style={{ fontSize: 17, fontWeight: 500 }}>{view.city}</div>
      <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', marginTop: 3 }}>
        Day {view.nn} / {view.date}
      </div>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 12px',
          fontSize: 11, color: 'var(--color-neutral-400)',
        }}
      >
        <i className="ph ph-cloud-sun" style={{ fontSize: 13 }} />
        {view.weather}
      </div>

      {view.planned ? (
        <div>
          {view.items.map((it, i) => (
            <button
              key={it.key}
              className="tap"
              onClick={() => onToggleItem(it.key)}
              style={{
                width: '100%', minHeight: 48, textAlign: 'left', background: 'none',
                border: 'none', padding: 0, color: 'inherit', cursor: 'pointer',
                display: 'grid', gridTemplateColumns: '46px 18px minmax(0,1fr)',
                gap: '0 10px', alignItems: 'start',
                animation: 'riseIn .3s ease both', animationDelay: i * 45 + 'ms',
              }}
            >
              <span
                className="mono num"
                style={{
                  fontSize: 10, color: 'var(--color-neutral-500)',
                  padding: '11px 0 0', textAlign: 'right', letterSpacing: '.04em',
                }}
              >
                {it.time}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 12 }}>
                <span
                  style={{
                    width: 9, height: 9, borderRadius: 9999,
                    border: '1px solid ' + (it.done ? 'var(--color-accent-500)' : 'var(--color-neutral-600)'),
                    background: it.done ? 'var(--color-accent-500)' : 'var(--color-bg)',
                  }}
                />
                <span style={{ flex: 1, width: 1, background: 'var(--color-neutral-800)', marginTop: 4 }} />
              </span>
              <span style={{ display: 'flex', gap: 10, padding: '9px 0 7px' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block', fontSize: 13.5, fontWeight: 500,
                      textDecoration: it.done ? 'line-through' : 'none',
                      color: it.done ? 'var(--color-neutral-600)' : 'var(--color-text)',
                    }}
                  >
                    {it.title}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--color-neutral-500)' }}>
                    {it.note}
                  </span>
                </span>
                <span className="num" style={{ fontSize: 11.5, color: 'var(--color-neutral-400)' }}>
                  {it.cost}
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div
          style={{
            padding: 16, borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-neutral-700)', color: 'var(--color-neutral-500)',
            fontSize: 12.5,
          }}
        >
          Nothing planned yet — added night, fill it in later.
        </div>
      )}
    </div>
  );
}
