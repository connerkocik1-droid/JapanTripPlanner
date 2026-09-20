'use client';

import { useState } from 'react';
import { CheckItem } from '@/lib/data';

export interface ChecklistTabProps {
  items: CheckItem[];
  onAdd: (text: string) => void;
  onSet: (id: string, text: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onPrint: () => void;
}

export default function ChecklistTab({ items, onAdd, onSet, onToggle, onRemove, onPrint }: ChecklistTabProps) {
  const [draft, setDraft] = useState('');
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const submit = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  };

  return (
    <div>
      {items.length ? (
        <div
          style={{
            padding: '11px 13px', borderRadius: 'var(--radius-md)',
            background: 'var(--color-surface)', border: '1px solid var(--color-neutral-800)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {done} of {items.length} done
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
      ) : null}

      <div style={{ display: 'flex', gap: 8, margin: items.length ? '14px 0 10px' : '0 0 10px' }}>
        <input
          type="text"
          value={draft}
          placeholder="Add something to do before you go"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          style={{
            flex: 1, minWidth: 0, minHeight: 44, fontSize: 13, padding: '0 10px',
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
            background: 'var(--color-surface)',
          }}
        />
        <button
          className="tap"
          onClick={submit}
          style={{
            flex: 'none', minHeight: 44, padding: '0 16px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-accent-500)', background: 'transparent',
            color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: 18, borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-neutral-800)',
            color: 'var(--color-neutral-600)', fontSize: 12.5, textAlign: 'center',
          }}
        >
          Nothing on the list yet — visas, bookings, packing, whatever matters.
        </div>
      ) : (
        <div style={{ borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', overflow: 'hidden' }}>
          {items.map((it) => (
            <div
              key={it.id}
              style={{
                minHeight: 50, padding: '6px 10px 6px 13px',
                borderBottom: '1px solid var(--color-divider)',
                display: 'flex', alignItems: 'center', gap: 11,
              }}
            >
              <button
                className="tap"
                onClick={() => onToggle(it.id)}
                aria-label={it.done ? 'Mark not done' : 'Mark done'}
                aria-pressed={it.done}
                style={{
                  width: 17, height: 17, borderRadius: 5, flex: 'none', padding: 0,
                  border: '1px solid ' + (it.done ? 'var(--color-accent-400)' : 'var(--color-neutral-700)'),
                  background: it.done ? 'var(--color-accent-400)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--color-bg)', fontSize: 11, cursor: 'pointer',
                }}
              >
                {it.done ? <i className="ph-fill ph-check" /> : null}
              </button>
              <input
                type="text"
                value={it.text}
                aria-label="Checklist item"
                onChange={(e) => onSet(it.id, e.target.value)}
                style={{
                  flex: 1, minWidth: 0, height: 38, fontSize: 13,
                  textDecoration: it.done ? 'line-through' : 'none',
                  color: it.done ? 'var(--color-neutral-600)' : 'var(--color-text)',
                }}
              />
              <button
                className="tap"
                onClick={() => onRemove(it.id)}
                aria-label="Remove item"
                style={{
                  width: 34, height: 34, flex: 'none', border: 'none', background: 'transparent',
                  color: 'var(--color-neutral-700)', cursor: 'pointer',
                }}
              >
                <i className="ph ph-trash" style={{ fontSize: 13 }} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className="tap"
        onClick={onPrint}
        style={{
          width: '100%', minHeight: 52, marginTop: 18, borderRadius: 'var(--radius-md)',
          border: '1px solid var(--color-accent-500)', background: 'transparent',
          color: 'var(--color-accent-200)', fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
        }}
      >
        <i className="ph ph-printer" style={{ fontSize: 15 }} />
        Print the itinerary
      </button>
      <div style={{ fontSize: 10.5, color: 'var(--color-neutral-600)', textAlign: 'center', margin: '8px 0 4px' }}>
        Hotels, transit and every day, on letter paper.
      </div>
    </div>
  );
}
