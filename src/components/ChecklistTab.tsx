'use client';

import { CHECKLIST } from '@/lib/data';

export interface ChecklistTabProps {
  checked: Record<string, boolean>;
  count: number;
  total: number;
  onToggle: (key: string) => void;
  onPrint: () => void;
}

export default function ChecklistTab({ checked, count, total, onToggle, onPrint }: ChecklistTabProps) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div
        style={{
          padding: '11px 13px', borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)', border: '1px solid var(--color-neutral-800)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>
            {count} of {total} done
          </div>
          <div className="num" style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-accent-300)' }}>
            {pct}%
          </div>
        </div>
        <div
          style={{
            height: 5, borderRadius: 9999, background: 'var(--color-neutral-900)',
            marginTop: 9, overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: pct + '%', height: '100%', background: 'var(--color-accent-400)',
              transition: 'width .3s ease',
            }}
          />
        </div>
      </div>

      {CHECKLIST.map((g, gi) => (
        <div key={g[0]} style={{ marginTop: 16 }}>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', marginBottom: 7 }}>
            {g[0]}
          </div>
          <div style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', overflow: 'hidden' }}>
            {g[1].map((label, li) => {
              const key = 'c' + gi + ':' + li;
              const on = !!checked[key];
              return (
                <button
                  key={key}
                  className="tap"
                  onClick={() => onToggle(key)}
                  style={{
                    width: '100%', minHeight: 50, padding: 13, textAlign: 'left',
                    background: 'none', border: 'none',
                    borderBottom: '1px solid var(--color-divider)',
                    display: 'flex', alignItems: 'center', gap: 11,
                    color: 'inherit', cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      width: 17, height: 17, borderRadius: 5, flex: 'none',
                      border: '1px solid ' + (on ? 'var(--color-accent-400)' : 'var(--color-neutral-700)'),
                      background: on ? 'var(--color-accent-400)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--color-bg)', fontSize: 11,
                    }}
                  >
                    {on ? <i className="ph-fill ph-check" /> : null}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      textDecoration: on ? 'line-through' : 'none',
                      color: on ? 'var(--color-neutral-600)' : 'var(--color-text)',
                    }}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        className="tap"
        onClick={onPrint}
        style={{
          width: '100%', minHeight: 52, marginTop: 18, borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-accent-500)', background: 'transparent',
          color: 'var(--color-accent-200)', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: 'pointer',
        }}
      >
        <i className="ph ph-printer" style={{ fontSize: 15 }} />
        Request itinerary PDF
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--color-neutral-600)', textAlign: 'center', margin: '8px 0 4px' }}>
        Prints the full itinerary — hotels, transit and every day — on letter paper.
      </div>
    </div>
  );
}
