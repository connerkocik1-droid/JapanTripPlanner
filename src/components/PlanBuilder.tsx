'use client';

import { fmtClock, fmtSpan } from '@/lib/dayPlan';
import { fmtUsd } from '@/lib/format';
import { Draft, PlanLeg, parseStartTime, startTimeValue, timeline } from '@/lib/planDraft';
import { LEG_STYLE } from '@/lib/legKind';
import { fmtDistance, fmtDuration } from '@/lib/routing';

/** What tapping a place on the map offers: the hop there, and a way to take it. */
export interface Preview {
  placeId: string;
  name: string;
  /** Where it is routed from — the hotel, or where the plan currently ends. */
  fromName: string;
  loading: boolean;
  leg: PlanLeg | null;
  /** Minutes past midnight you would arrive, while a plan is being built. */
  arrive: number | null;
  /** Set when the hop cannot be routed at all. */
  problem: string;
}

export interface PlanBuilderProps {
  draft: Draft | null;
  cityName: string;
  /** The hotel the day leaves from and comes back to. */
  homeName: string;
  dayLabel: string;
  travelers: number;
  back: PlanLeg | null;
  backLoading: boolean;
  preview: Preview | null;
  onSetStart: (mins: number) => void;
  onAddPreview: () => void;
  onClosePreview: () => void;
  onRemoveStop: (index: number) => void;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * The plan being built, floating over the map so it stays tappable underneath.
 *
 * It is deliberately one surface: the stops so far, the hop you are being
 * offered, and the way home — which is always shown, because a plan you cannot
 * get back from is not a plan.
 */
export default function PlanBuilder({
  draft, cityName, homeName, dayLabel, travelers, back, backLoading, preview,
  onSetStart, onAddPreview, onClosePreview, onRemoveStop, onSave, onDiscard,
}: PlanBuilderProps) {
  if (!draft && !preview) return null;
  const line = draft ? timeline(draft, back, homeName) : null;

  return (
    <div
      style={{
        position: 'absolute', left: 8, right: 8, bottom: 'calc(var(--safe-bottom) + 10px)', zIndex: 7,
        borderRadius: 'var(--radius-md)', overflow: 'hidden',
        background: 'rgba(27,30,46,.97)', backdropFilter: 'blur(16px)',
        border: '1px solid var(--color-accent-700)',
        boxShadow: '0 10px 40px rgba(0,0,0,.55)',
        animation: 'fadeIn .18s ease both',
      }}
    >
      {draft ? (
        <div style={{ padding: '9px 11px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="mono" style={{ flex: 1, minWidth: 0, fontSize: 9.5, color: 'var(--color-accent-300)' }}>
              Planning {dayLabel} · {cityName}
            </div>
            <label className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)' }}>
              Start
            </label>
            <input
              type="time"
              value={startTimeValue(draft.startMins)}
              aria-label="Start time"
              onChange={(e) => onSetStart(parseStartTime(e.target.value, draft.startMins))}
              className="num"
              style={{
                width: 84, height: 32, fontSize: 12.5, textAlign: 'center',
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
                background: 'var(--color-bg)',
              }}
            />
          </div>

          {draft.stops.length === 0 ? (
            <div
              className="mono"
              style={{ fontSize: 10, color: 'var(--color-neutral-500)', padding: '10px 2px 4px' }}
            >
              Tap a place on the map. The route from {homeName} comes with it.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {line?.rows.map((row, i) => (
                <div key={draft.stops[i].placeId + i} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span
                    className="mono num"
                    style={{ flex: 'none', width: 38, fontSize: 9.5, color: 'var(--color-accent-300)' }}
                  >
                    {fmtClock(row.arrive)}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block', fontSize: 12, fontWeight: 500,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {row.name}
                    </span>
                    <LegLine leg={row.leg} />
                  </span>
                  <button
                    className="tap"
                    onClick={() => onRemoveStop(i)}
                    aria-label={'Take ' + row.name + ' out of the plan'}
                    style={{
                      flex: 'none', width: 28, height: 28, border: 'none', background: 'transparent',
                      color: 'var(--color-neutral-700)', cursor: 'pointer',
                    }}
                  >
                    <i className="ph ph-x" style={{ fontSize: 12 }} />
                  </button>
                </div>
              ))}

              {/* The way home, always — it is part of the day whether you plan it or not. */}
              <div
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 7, paddingTop: 5,
                  borderTop: '1px dashed var(--color-neutral-800)',
                }}
              >
                <span
                  className="mono num"
                  style={{ flex: 'none', width: 38, fontSize: 9.5, color: 'var(--color-neutral-500)' }}
                >
                  {line?.back ? fmtClock(line.back.row.arrive) : '—'}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block', fontSize: 11.5, color: 'var(--color-neutral-400)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    <i className="ph ph-arrow-u-down-left" style={{ fontSize: 11, marginRight: 5 }} />
                    Back to {homeName}
                  </span>
                  {backLoading ? (
                    <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
                      Routing…
                    </span>
                  ) : back ? (
                    <LegLine leg={back} />
                  ) : (
                    <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-700)' }}>
                      No route back found
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {line && draft.stops.length ? (
            <div
              className="mono num"
              style={{ fontSize: 9, color: 'var(--color-neutral-500)', marginTop: 8 }}
            >
              Home {fmtClock(line.endMins)} · {fmtSpan(line.movingMins)} moving ·{' '}
              {line.cost ? fmtUsd(line.cost) + ' fares for ' + travelers : 'no fares'}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
            <button
              className="tap"
              onClick={onSave}
              disabled={!draft.stops.length}
              style={{
                flex: 1, minHeight: 40, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                background: draft.stops.length ? 'var(--color-accent-600)' : 'var(--color-neutral-900)',
                color: draft.stops.length ? 'var(--color-accent-100)' : 'var(--color-neutral-700)',
                fontSize: 12.5, fontWeight: 500,
              }}
            >
              Save to {dayLabel}
            </button>
            <button
              className="tap"
              onClick={onDiscard}
              style={{
                flex: 'none', minHeight: 40, padding: '0 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-neutral-800)', background: 'transparent',
                color: 'var(--color-neutral-400)', fontSize: 12, cursor: 'pointer',
              }}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div
          style={{
            padding: '9px 11px',
            borderTop: draft ? '1px solid var(--color-neutral-800)' : 'none',
            background: 'rgba(145,132,217,.08)',
          }}
        >
          <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
            From {preview.fromName}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <span
              style={{
                flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {preview.name}
            </span>
            {preview.leg ? (
              <>
                <span className="num" style={{ flex: 'none', fontSize: 13.5, fontWeight: 600 }}>
                  {fmtDuration(preview.leg.seconds)}
                </span>
                <span
                  className="num"
                  style={{ flex: 'none', fontSize: 13.5, fontWeight: 600, color: 'var(--color-accent-300)' }}
                >
                  {preview.leg.cost ? fmtUsd(preview.leg.cost) : 'free'}
                </span>
              </>
            ) : null}
          </div>

          {preview.loading ? (
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-600)', marginTop: 3 }}>
              Routing…
            </div>
          ) : preview.leg ? (
            <div style={{ marginTop: 3 }}>
              <LegLine leg={preview.leg} verbose />
              {preview.arrive !== null ? (
                <div className="mono num" style={{ fontSize: 9, color: 'var(--color-neutral-500)', marginTop: 2 }}>
                  Arrive {fmtClock(preview.arrive)}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mono" style={{ fontSize: 9.5, color: '#ff8fae', marginTop: 3 }}>
              {preview.problem || 'No route found.'}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
            <button
              className="tap"
              onClick={onAddPreview}
              disabled={!preview.leg}
              style={{
                flex: 1, minHeight: 40, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
                background: preview.leg ? 'var(--color-accent-600)' : 'var(--color-neutral-900)',
                color: preview.leg ? 'var(--color-accent-100)' : 'var(--color-neutral-700)',
                fontSize: 12.5, fontWeight: 500,
              }}
            >
              {draft ? 'Add to plan' : 'Start a plan here'}
            </button>
            <button
              className="tap"
              onClick={onClosePreview}
              style={{
                flex: 'none', minHeight: 40, padding: '0 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-neutral-800)', background: 'transparent',
                color: 'var(--color-neutral-400)', fontSize: 12, cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "19 min metro · 9 min walking · 12.4 km · EST" — the same shape everywhere. */
function LegLine({ leg, verbose = false }: { leg: PlanLeg; verbose?: boolean }) {
  return (
    <span
      className="mono"
      style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        fontSize: 9, color: 'var(--color-neutral-500)',
      }}
    >
      {/* The words carry the map's colours, so a line and its leg read as one. */}
      {leg.rideSeconds ? (
        <span
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            color: LEG_STYLE[leg.rail ? 'rail' : 'metro'].color,
          }}
        >
          <i className={'ph ' + (leg.rail ? 'ph-train' : 'ph-train-simple')} style={{ fontSize: 10 }} />
          <span className="num">{fmtDuration(leg.rideSeconds)}</span> {leg.rail ? 'train' : 'metro'}
        </span>
      ) : null}
      {leg.walkSeconds ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: LEG_STYLE.walk.color }}>
          <i className="ph ph-person-simple-walk" style={{ fontSize: 10 }} />
          <span className="num">{fmtDuration(leg.walkSeconds)}</span> walking
        </span>
      ) : null}
      {verbose ? <span className="num">{fmtDistance(leg.meters)}</span> : null}
      {verbose && leg.summary ? <span>{leg.summary}</span> : null}
      {leg.estimated ? (
        <span style={{ fontSize: 7.5, opacity: 0.7 }} title="Modelled, not routed">
          EST
        </span>
      ) : null}
    </span>
  );
}
