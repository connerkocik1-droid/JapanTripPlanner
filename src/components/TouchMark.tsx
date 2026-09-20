'use client';

import { PEOPLE, ago } from '@/lib/people';
import { Touch } from '@/lib/tripState';

/** Whose color outlines a control that someone has changed. */
export function touchStyle(t: Touch | undefined) {
  if (!t) return null;
  const p = PEOPLE[t.by];
  return { borderColor: p.color, boxShadow: `0 0 0 1px ${p.color}` };
}

/** A small "Conner · 4m ago" credit line. */
export default function TouchMark({ touch, align = 'left' }: { touch?: Touch; align?: 'left' | 'right' }) {
  if (!touch) return null;
  const p = PEOPLE[touch.by];
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 8.5,
        color: p.color, justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <span
        style={{
          width: 13, height: 13, borderRadius: 9999, flex: 'none',
          border: '1px solid ' + p.color, color: p.color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 7.5, fontWeight: 600,
        }}
      >
        {p.initial}
      </span>
      {p.name} · {ago(touch.at)}
    </span>
  );
}
