'use client';

import { useState } from 'react';
import { PEOPLE, ago } from '@/lib/people';
import { Comment } from '@/lib/tripState';

export interface NotesTabProps {
  comments: Comment[];
  cities: { id: string; name: string }[];
  /** Pre-selected scope for a new note — the city currently in focus. */
  current: string | null;
  onAdd: (text: string, city: string | null) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

function cityName(cities: { id: string; name: string }[], id: string | null): string {
  if (!id) return 'Whole trip';
  return cities.find((c) => c.id === id)?.name ?? 'Removed city';
}

export default function NotesTab({ comments, cities, current, onAdd, onToggle, onRemove }: NotesTabProps) {
  const [text, setText] = useState('');
  const [scope, setScope] = useState<string>(current ?? '__trip');
  const [showDone, setShowDone] = useState(false);

  const visible = comments.filter((c) => showDone || !c.resolved);
  const openCount = comments.filter((c) => !c.resolved).length;

  const submit = () => {
    if (!text.trim()) return;
    onAdd(text, scope === '__trip' ? null : scope);
    setText('');
  };

  return (
    <div>
      <div
        style={{
          padding: 11, borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)', border: '1px solid var(--color-neutral-800)',
        }}
      >
        <textarea
          value={text}
          placeholder="Something you're thinking about but haven't decided…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          rows={3}
          style={{
            width: '100%', resize: 'vertical', background: 'transparent', border: 'none',
            outline: 'none', color: 'var(--color-text)', fontSize: 13, lineHeight: 1.45,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            aria-label="What this note is about"
            style={{
              flex: 1, minWidth: 0, minHeight: 40, background: 'var(--color-bg)',
              color: 'var(--color-neutral-300)', fontSize: 12,
              border: '1px solid var(--color-neutral-800)', borderRadius: 'var(--radius-sm)',
              padding: '0 8px',
            }}
          >
            <option value="__trip">Whole trip</option>
            {cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            className="tap"
            onClick={submit}
            style={{
              flex: 'none', minHeight: 40, padding: '0 16px', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-accent-500)', background: 'transparent',
              color: 'var(--color-accent-200)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Save note
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)' }}>
          {openCount} open {openCount === 1 ? 'note' : 'notes'}
        </div>
        <button
          className="tap"
          onClick={() => setShowDone((v) => !v)}
          style={{
            minHeight: 32, padding: '0 10px', borderRadius: 9999,
            border: '1px solid var(--color-neutral-800)', background: 'transparent',
            color: 'var(--color-neutral-500)', fontSize: 11, cursor: 'pointer',
          }}
        >
          {showDone ? 'Hide settled' : 'Show settled'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div
          style={{
            padding: 18, borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-neutral-800)',
            color: 'var(--color-neutral-600)', fontSize: 12.5, textAlign: 'center',
          }}
        >
          No notes yet — park an idea here and decide later.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {visible.map((c) => {
            const p = PEOPLE[c.by];
            return (
              <div
                key={c.id}
                style={{
                  padding: 11, borderRadius: 'var(--radius-md)',
                  background: 'var(--color-surface)',
                  border: '1px solid ' + (c.resolved ? 'var(--color-neutral-800)' : p.color),
                  opacity: c.resolved ? 0.55 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: 9999, flex: 'none',
                      border: '1px solid ' + p.color, background: p.glow, color: p.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9.5, fontWeight: 600,
                    }}
                  >
                    {p.initial}
                  </span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
                    {p.name} · {cityName(cities, c.city)} · {ago(c.at)}
                  </span>
                  <button
                    className="tap"
                    onClick={() => onToggle(c.id)}
                    aria-label={c.resolved ? 'Reopen note' : 'Mark note settled'}
                    style={{
                      marginLeft: 'auto', width: 32, height: 32, borderRadius: 'var(--radius-sm)',
                      border: 'none', background: 'transparent',
                      color: c.resolved ? 'var(--color-accent-400)' : 'var(--color-neutral-600)',
                      cursor: 'pointer',
                    }}
                  >
                    <i className={c.resolved ? 'ph-fill ph-check-circle' : 'ph ph-check-circle'} style={{ fontSize: 15 }} />
                  </button>
                  <button
                    className="tap"
                    onClick={() => onRemove(c.id)}
                    aria-label="Delete note"
                    style={{
                      width: 32, height: 32, borderRadius: 'var(--radius-sm)', border: 'none',
                      background: 'transparent', color: 'var(--color-neutral-700)', cursor: 'pointer',
                    }}
                  >
                    <i className="ph ph-trash" style={{ fontSize: 14 }} />
                  </button>
                </div>
                <div
                  style={{
                    fontSize: 13, lineHeight: 1.45, marginTop: 7,
                    whiteSpace: 'pre-wrap',
                    textDecoration: c.resolved ? 'line-through' : 'none',
                  }}
                >
                  {c.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
