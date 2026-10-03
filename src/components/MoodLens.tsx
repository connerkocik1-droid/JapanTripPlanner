'use client';

import { useState } from 'react';
import {
  nextUnanswered, question, summaryChips, type Answers, type QuestionId,
} from '../../supabase/functions/draft-day/questions.ts';

export interface MoodLensProps {
  lens: Answers;
  /** How many places the mood is holding back, so the list can say so. */
  hidden: number;
  onChange: (next: Answers) => void;
}

/**
 * The mood above the place list: what you are in the mood for, as chips.
 *
 * It is the same questions "Help me decide" asks, and asking it there fills
 * this in. The difference is that nothing here waits on anything: changing one
 * chip re-sorts the list underneath on the spot, so it is a dial rather than a
 * round trip. You can also set it from cold, which is the point of it working
 * without Claude being switched on at all.
 *
 * A mood is the one thing allowed to take places out of the list, so it says
 * how many it took, and Clear is always one tap away.
 */
export default function MoodLens({ lens, hidden, onChange }: MoodLensProps) {
  /** The question whose options are open, if any. */
  const [open, setOpen] = useState<QuestionId | null>(null);
  /**
   * True while setting a mood from nothing, which walks the questions. Editing
   * one chip of an existing mood changes that one thing and stops.
   */
  const [walking, setWalking] = useState(false);

  const chips = summaryChips(lens);
  const q = open ? question(open) : null;

  const pick = (id: QuestionId, value: string) => {
    const next = { ...lens, [id]: value };
    onChange(next);
    const after = walking ? nextUnanswered(next, {}) : null;
    setOpen(after);
    if (!after) setWalking(false);
  };

  const start = () => {
    setWalking(true);
    setOpen(nextUnanswered(lens, {}) ?? 'after');
  };

  return (
    <div role="group" aria-label="Mood" style={{ marginBottom: 9 }}>
      {/* Named, because the kinds are chips too and two unlabelled rows of
          chips one above the other read as one strip of nine things. */}
      {chips.length ? (
        <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)', marginBottom: 5 }}>
          IN THE MOOD FOR
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {chips.length ? (
          chips.map((c) => (
            <button
              key={c.id}
              className="tap"
              onClick={() => {
                setWalking(false);
                setOpen(open === c.id ? null : c.id);
              }}
              style={{ ...chip, ...(open === c.id ? on : {}) }}
            >
              {c.label}
            </button>
          ))
        ) : (
          <button className="tap" onClick={start} style={{ ...chip, borderStyle: 'dashed' }}>
            <i className="ph ph-sliders-horizontal" style={{ fontSize: 11, marginRight: 5 }} />
            Set a mood
          </button>
        )}

        {chips.length && nextUnanswered(lens, {}) ? (
          <button className="tap" onClick={start} aria-label="Add to the mood" style={{ ...chip, padding: '0 9px' }}>
            +
          </button>
        ) : null}

        {chips.length ? (
          <button
            className="tap"
            onClick={() => {
              setOpen(null);
              setWalking(false);
              onChange({});
            }}
            style={{ ...chip, border: 'none', color: 'var(--color-neutral-500)' }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {q ? (
        <div style={{ marginTop: 7 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)', marginBottom: 5 }}>
            {q.ask.toUpperCase()}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {q.options.map((o) => (
              <button
                key={o.id}
                className="tap"
                onClick={() => pick(q.id, o.id)}
                style={{ ...chip, ...(lens[q.id] === o.id ? on : {}) }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {hidden ? (
        <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)', marginTop: 7 }}>
          {hidden} {hidden === 1 ? 'place is' : 'places are'} hidden by this mood
        </div>
      ) : null}
    </div>
  );
}

const chip = {
  minHeight: 32,
  padding: '0 11px',
  borderRadius: 9999,
  cursor: 'pointer',
  fontSize: 11,
  border: '1px solid var(--color-neutral-800)',
  background: 'transparent',
  color: 'var(--color-neutral-500)',
  display: 'flex',
  alignItems: 'center',
};

const on = {
  border: '1px solid var(--color-accent-500)',
  background: 'var(--tint-accent)',
  color: 'var(--color-accent-200)',
};
