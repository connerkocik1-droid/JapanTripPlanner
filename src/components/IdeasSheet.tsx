'use client';

import { ReactNode, useState } from 'react';

type Side = 'todo' | 'ideas';

/**
 * Everything that is not a day: the to-dos before you go, and the ideas and
 * notes the two of you leave each other.
 *
 * They were a tab each, which is two of a phone's tab strip spent on things
 * you open now and then. They are the same kind of thing — a list you add to
 * between other things — so they share one sheet, reachable from the plan,
 * with a switch between them. Nothing about either list changed.
 */
export default function IdeasSheet({
  todos, ideas, openTodos, openIdeas, start = 'todo', onClose,
}: {
  todos: ReactNode;
  ideas: ReactNode;
  /** How many to-dos are not ticked off, for the switch. */
  openTodos: number;
  /** How many notes nobody has settled, for the switch. */
  openIdeas: number;
  start?: Side;
  onClose: () => void;
}) {
  const [side, setSide] = useState<Side>(start);

  return (
    <div
      role="dialog"
      aria-label="Ideas and to-dos"
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0, border: 'none', cursor: 'pointer',
          background: 'color-mix(in srgb, var(--color-text) 28%, transparent)',
        }}
      />
      <div
        style={{
          position: 'relative', maxHeight: '86vh', display: 'flex', flexDirection: 'column',
          background: 'var(--color-raised)',
          borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
          borderTop: '1px solid var(--color-neutral-800)',
          boxShadow: 'var(--shadow-card)',
          animation: 'riseIn .22s ease both',
        }}
      >
        <div
          style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 8,
            padding: '12px 14px 10px',
          }}
        >
          <div style={{ display: 'flex', gap: 5, flex: 1, minWidth: 0 }}>
            {([
              ['todo', 'To-dos', openTodos],
              ['ideas', 'Ideas', openIdeas],
            ] as [Side, string, number][]).map(([id, text, count]) => {
              const on = side === id;
              return (
                <button
                  key={id}
                  className="tap"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setSide(id)}
                  style={{
                    minHeight: 34, padding: '0 12px', borderRadius: 9999, cursor: 'pointer',
                    fontSize: 12.5, fontWeight: 600,
                    border: '1px solid ' + (on ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                    background: on ? 'var(--tint-accent)' : 'transparent',
                    color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {text}
                  {count ? (
                    <span className="mono num" style={{ fontSize: 9, opacity: 0.8 }}>{count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <button className="tap" onClick={onClose} aria-label="Close" style={iconBtn}>
            <i className="ph ph-x" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 14px calc(var(--safe-bottom) + 16px)' }}>
          {side === 'todo' ? todos : ideas}
        </div>
      </div>
    </div>
  );
}

const iconBtn = {
  flex: 'none' as const,
  width: 34,
  height: 34,
  borderRadius: 9999,
  cursor: 'pointer',
  border: '1px solid var(--color-neutral-800)',
  background: 'transparent',
  color: 'var(--color-neutral-500)',
  fontSize: 13,
};
