'use client';

import { ReactNode, useState } from 'react';
import { City } from '@/lib/data';
import { CitySpend, DayEntry, selectedHotel } from '@/lib/derive';
import { dateOf, fmtD, fmtDow, fmtUsd } from '@/lib/format';
import { splitTier } from '@/lib/hotelTier';
import type { Rates } from '@/lib/money';
import { Local } from './CityMoney';
import StaySheet from './StaySheet';

export interface PlanTabProps {
  cities: City[];
  schedule: DayEntry[];
  /** City id → the day the stay starts on, and how many nights it runs. */
  span: Record<string, { start: number; nights: number }>;
  spend: Record<string, CitySpend>;
  /** The trip's first date, which every day number is counted from. */
  start: string;
  /** The day that is open. Only one day is worked on at a time. */
  selected: number;
  rates: Rates | null;
  onSelectDay: (n: number) => void;
  onSetActive: (cityId: string, hotelId: string | null) => void;
  /** Opens the ideas and to-dos sheet over the plan. */
  onOpenIdeas: () => void;
  /**
   * The city's own editor — its places, money, food and transit — opened from
   * its header. `openStay` hands the shortlist back to the sheet, so there is
   * one way into it.
   */
  cityEditor: (city: City, helpers: { openStay: () => void }) => ReactNode;
  /** The shortlist editor, shown inside the stay sheet when it is asked for. */
  stayEditor: (city: City) => ReactNode;
  /** Adding a city, and the trip's settings: the end of the timeline. */
  footer?: ReactNode;
  /** To-dos not ticked off, and notes nobody has settled. */
  openCounts: { todos: number; ideas: number };
  /** The open day's planner, rendered under its row in the timeline. */
  dayDetail: ReactNode;
}

/**
 * The whole trip as one scroll: every city in order, every day under its city.
 *
 * It replaces flicking between a list of cities, a list of hotels and a strip
 * of day numbers. The trip reads top to bottom the way it will be lived, a
 * city at a time, and a day opens where it sits rather than somewhere else.
 * The city's header carries what you would otherwise go looking for — how many
 * nights, where you are sleeping, what the city costs — and the stay opens the
 * shortlist over the plan instead of sending you away from it.
 */
export default function PlanTab({
  cities, schedule, span, spend, start, selected, rates,
  onSelectDay, onSetActive, onOpenIdeas, openCounts, cityEditor, stayEditor, footer, dayDetail,
}: PlanTabProps) {
  /** The city whose shortlist is open over the plan, if any. */
  const [staying, setStaying] = useState<string | null>(null);
  /** The city whose own editor is open under its header, if any. */
  const [editing, setEditing] = useState<string | null>(null);

  if (!schedule.length) {
    return (
      <div>
        <div
          style={{
            padding: '22px 16px', borderRadius: 'var(--radius-md)',
            border: '1px dashed var(--color-neutral-800)', textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 500 }}>Nothing planned yet</div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-500)', margin: '6px 0 2px', lineHeight: 1.5 }}>
            Add a city and its nights show up here as days to plan.
          </div>
        </div>
        {footer}
      </div>
    );
  }

  const openSheet = cities.find((c) => c.id === staying) ?? null;
  const pending = openCounts.todos + openCounts.ideas;

  return (
    <div>
      {/* Everything that is not a day, one tap from the plan. */}
      <button
        className="tap"
        onClick={onOpenIdeas}
        style={{
          width: '100%', minHeight: 40, marginBottom: 12, padding: '0 11px',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
          border: '1px solid var(--color-neutral-800)', background: 'transparent',
          color: 'var(--color-neutral-400)', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <i className="ph ph-check-square" style={{ flex: 'none', fontSize: 14 }} />
        <span style={{ flex: 1, minWidth: 0 }}>Ideas &amp; to-dos</span>
        {pending ? (
          <span className="mono num" style={{ flex: 'none', fontSize: 9, color: 'var(--color-accent-300)' }}>
            {pending} OPEN
          </span>
        ) : null}
        <i className="ph ph-caret-right" style={{ flex: 'none', fontSize: 12, color: 'var(--color-neutral-600)' }} />
      </button>

      {cities.map((city) => {
        const here = span[city.id];
        if (!here || here.nights < 1) return null;
        const days = schedule.filter((e) => e.city.id === city.id);
        const money = spend[city.id];
        const cost = (money?.total ?? 0) + (money?.activities ?? 0);
        const hotel = selectedHotel(city);
        const named = splitTier(hotel?.name ?? '');
        const from = dateOf(start, here.start - 1);
        const to = dateOf(start, here.start + here.nights - 2);

        return (
          <div key={city.id} style={{ marginBottom: 18 }}>
            <div
              style={{
                padding: '11px 12px 9px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-neutral-800)', background: 'var(--color-surface)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 500 }}>{city.name}</div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
                    {here.nights} {here.nights === 1 ? 'NIGHT' : 'NIGHTS'} · {fmtD(from)} – {fmtD(to)}
                  </div>
                </div>
                <div style={{ flex: 'none', textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 14, fontWeight: 600 }}>
                    {cost ? fmtUsd(cost) : '—'}
                  </div>
                  <Local usd={cost} city={city} rates={rates} />
                </div>
                <button
                  className="tap"
                  aria-expanded={editing === city.id}
                  aria-label={'Edit ' + city.name}
                  onClick={() => setEditing((cur) => (cur === city.id ? null : city.id))}
                  style={{
                    flex: 'none', width: 32, height: 32, borderRadius: 9999, cursor: 'pointer',
                    border: '1px solid var(--color-neutral-800)', background: 'transparent',
                    color: 'var(--color-neutral-500)', fontSize: 12,
                  }}
                >
                  <i className={editing === city.id ? 'ph ph-caret-up' : 'ph ph-sliders-horizontal'} />
                </button>
              </div>

              {/* The stay, which is the one thing about a city you check most. */}
              <button
                className="tap"
                aria-label={'Compare where to stay in ' + city.name}
                onClick={() => setStaying(city.id)}
                style={{
                  width: '100%', marginTop: 9, minHeight: 42, padding: '0 10px',
                  borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                  border: '1px solid ' + (hotel ? 'var(--color-accent-700)' : 'var(--color-neutral-800)'),
                  background: hotel ? 'var(--tint-accent)' : 'transparent',
                  color: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <i
                  className="ph ph-bed"
                  style={{ flex: 'none', fontSize: 14, color: 'var(--color-accent-300)' }}
                />
                <span
                  style={{
                    flex: 1, minWidth: 0, fontSize: 12.5,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {hotel ? named.name || 'Untitled option' : 'No stay picked yet'}
                  {named.tier ? <span className="mono hc-tier">{named.tier}</span> : null}
                </span>
                {hotel?.cost ? (
                  <span className="mono num" style={{ flex: 'none', fontSize: 9.5, color: 'var(--color-neutral-500)' }}>
                    {fmtUsd(Number(hotel.cost) || 0)}/NIGHT
                  </span>
                ) : null}
                <i
                  className="ph ph-caret-right"
                  style={{ flex: 'none', fontSize: 12, color: 'var(--color-neutral-600)' }}
                />
              </button>

              {editing === city.id ? (
                <div style={{ marginTop: 6 }}>
                  {cityEditor(city, { openStay: () => setStaying(city.id) })}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {days.map((entry) => {
                const open = entry.n === selected;
                const dt = dateOf(start, entry.n - 1);
                const spent = entry.items.reduce((a, it) => a + (Number(it.cost) || 0), 0);
                return (
                  <div key={entry.key}>
                    <button
                      className="tap"
                      aria-expanded={open}
                      onClick={() => onSelectDay(entry.n)}
                      style={{
                        width: '100%', minHeight: 46, padding: '0 11px', textAlign: 'left',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'inherit',
                        border: '1px solid ' + (open ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                        background: open ? 'var(--tint-accent)' : 'var(--color-raised)',
                        display: 'flex', alignItems: 'center', gap: 9,
                      }}
                    >
                      <span
                        className="mono num"
                        style={{
                          flex: 'none', fontSize: 10, letterSpacing: '.04em',
                          color: open ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
                        }}
                      >
                        DAY {entry.n}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>
                        {fmtDow(dt)} {fmtD(dt)}
                        <span className="mono" style={{ marginLeft: 7, fontSize: 9, color: 'var(--color-neutral-500)' }}>
                          {entry.items.length
                            ? entry.items.length + (entry.items.length === 1 ? ' STOP' : ' STOPS')
                            : 'NOTHING YET'}
                        </span>
                      </span>
                      {spent ? (
                        <span className="num" style={{ flex: 'none', fontSize: 11.5 }}>{fmtUsd(spent)}</span>
                      ) : null}
                      <i
                        className={open ? 'ph ph-caret-up' : 'ph ph-caret-down'}
                        style={{ flex: 'none', fontSize: 12, color: 'var(--color-neutral-600)' }}
                      />
                    </button>
                    {open ? <div style={{ padding: '8px 0 2px' }}>{dayDetail}</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {footer}

      {openSheet ? (
        <StaySheet
          city={openSheet}
          rates={rates}
          editor={stayEditor(openSheet)}
          // Switching the stay re-costs the city under the sheet; it does not
          // take you to the map, because you are reading the plan.
          onSetActive={(id) => onSetActive(openSheet.id, id)}
          onClose={() => setStaying(null)}
        />
      ) : null}
    </div>
  );
}
