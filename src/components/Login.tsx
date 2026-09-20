'use client';

import { PERSON_LIST, PersonId } from '@/lib/people';

/** Unsecured on purpose — this is a two-person, private planner. Tap a face. */
export default function Login({ onPick }: { onPick: (id: PersonId) => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'radial-gradient(70% 50% at 50% 30%, #1d2034 0%, #101220 70%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 28, padding: 24,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-accent-300)' }}>
          Korea + Japan · Mar 2027
        </div>
        <div style={{ fontSize: 22, fontWeight: 500, marginTop: 6 }}>Who&rsquo;s planning?</div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', marginTop: 6 }}>
          Your picks get outlined in your color.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22 }}>
        {PERSON_LIST.map((p) => (
          <button
            key={p.id}
            className="tap"
            onClick={() => onPick(p.id)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 8,
            }}
          >
            <span
              style={{
                width: 92, height: 92, borderRadius: 9999,
                border: '2px solid ' + p.color, background: p.glow,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 34, fontWeight: 600, color: p.color,
                boxShadow: '0 8px 30px rgba(0,0,0,.45)',
              }}
            >
              {p.initial}
            </span>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
          </button>
        ))}
      </div>

      <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)', textAlign: 'center' }}>
        No password · switch any time from the header
      </div>
    </div>
  );
}
