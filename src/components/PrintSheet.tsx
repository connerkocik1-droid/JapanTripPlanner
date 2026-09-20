'use client';

import { PARTY } from '@/lib/data';
import { Derived, dayView, transitLabel } from '@/lib/derive';
import { dateOf, fmtD, fmtUsd } from '@/lib/format';
import { TripDoc } from '@/lib/tripState';

/** Hidden in the app, printed on paper. */
export default function PrintSheet({ d, doc }: { d: Derived; doc: TripDoc }) {
  return (
    <div id="trip-print">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: '18pt', fontWeight: 600 }}>Korea + Japan</div>
        <div style={{ fontSize: '10pt', color: '#4a4d5c' }}>
          {d.tripRange} · {d.tripLength} · {PARTY} travelers
        </div>
        <div style={{ fontSize: '10pt', marginTop: 4 }}>
          Selections {fmtUsd(d.grand)} · Activities {fmtUsd(d.ground)} · Total{' '}
          {fmtUsd(d.grand + d.ground)}
        </div>
      </div>

      {d.order.map((c) => {
        const m = d.meta[c];
        const cfg = m.cfg;
        const hotel = cfg.hotels[cfg.hotelSel];
        return (
          <div key={c} className="pc" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: '13pt', fontWeight: 600 }}>{c}</div>
              <div style={{ fontSize: '10pt' }}>
                {fmtD(dateOf(m.start))} – {fmtD(dateOf(m.start + m.count - 1))} ·{' '}
                {m.count} {m.count === 1 ? 'night' : 'nights'} · {fmtUsd(d.picked[c].total)}
              </div>
            </div>
            <div style={{ fontSize: '10pt', color: '#4a4d5c', margin: '4px 0 8px' }}>
              {hotel?.name ? (
                <div>
                  Hotel: {hotel.name} · {fmtUsd(Number(hotel.cost) || 0)}/night
                  {hotel.addr ? ' · ' + hotel.addr : ''}
                </div>
              ) : null}
              <div>
                {transitLabel(c)}: {cfg.trainName || '—'} ·{' '}
                {fmtUsd((Number(cfg.trainCost) || 0) * PARTY)}
              </div>
              <div>Food: {fmtUsd(cfg.foodPer)}/day</div>
            </div>

            {Array.from({ length: m.count }, (_, j) => {
              const day = dayView(d, doc, m.start + j);
              return (
                <div key={j} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '10pt', fontWeight: 600 }}>
                    Day {day.nn} · {day.date} · {day.total}
                  </div>
                  {day.items.length ? (
                    day.items.map((it) => (
                      <div
                        key={it.key}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '44pt 1fr auto',
                          gap: '0 10pt',
                          fontSize: '10pt',
                          padding: '3px 0',
                          borderBottom: '1px dotted #d9dbe4',
                        }}
                      >
                        <span>{it.time}</span>
                        <span>
                          {it.title}
                          {it.note ? ' — ' + it.note : ''}
                        </span>
                        <span>{it.cost}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '10pt', color: '#75798c' }}>Nothing planned yet</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
