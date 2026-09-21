'use client';

import { Derived, selectedHotel } from '@/lib/derive';
import { dateOf, fmtD, fmtDow, fmtUsd } from '@/lib/format';
import { TripDoc } from '@/lib/tripState';

/** Hidden in the app, printed on paper. */
export default function PrintSheet({ d, doc }: { d: Derived; doc: TripDoc }) {
  const { trip } = doc;
  const last = Math.max(0, d.schedule.length - 1);
  return (
    <div id="trip-print">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: '18pt', fontWeight: 600 }}>{trip.name || 'Trip'}</div>
        <div style={{ fontSize: '10pt', color: '#4a4d5c' }}>
          {d.schedule.length
            ? `${fmtD(dateOf(trip.start, 0))} – ${fmtD(dateOf(trip.start, last))} · ${d.schedule.length} days`
            : 'No days planned'}{' '}
          · {trip.travelers} {trip.travelers === 1 ? 'traveler' : 'travelers'}
        </div>
        <div style={{ fontSize: '10pt', marginTop: 4 }}>
          Selections {fmtUsd(d.totals.grand)} · Planned items {fmtUsd(d.totals.activities)} · Total{' '}
          {fmtUsd(d.totals.grand + d.totals.activities)}
          {trip.planned ? ` · Budget ${fmtUsd(trip.planned)}` : ''}
        </div>
      </div>

      {d.cities.map((c) => {
        const span = d.span[c.id];
        const hotel = selectedHotel(c);
        const days = d.schedule.filter((s) => s.city.id === c.id);
        return (
          <div key={c.id} className="pc" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: '13pt', fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: '10pt' }}>
                {fmtD(dateOf(trip.start, span.start - 1))} –{' '}
                {fmtD(dateOf(trip.start, span.start + span.nights - 2))} · {span.nights}{' '}
                {span.nights === 1 ? 'night' : 'nights'} · {fmtUsd(d.spend[c.id].total)}
              </div>
            </div>
            <div style={{ fontSize: '10pt', color: '#4a4d5c', margin: '4px 0 8px' }}>
              {hotel?.name ? (
                <div>
                  Hotel: {hotel.name}
                  {hotel.cost ? ` · ${fmtUsd(hotel.cost)}/night` : ''}
                  {hotel.addr ? ` · ${hotel.addr}` : ''}
                </div>
              ) : null}
              {c.transitName ? (
                <div>
                  Getting there: {c.transitName}
                  {c.flightNo ? ` · ${c.flightNo}` : ''}
                  {c.arriveAt ? ` · arrives ${c.arriveAt}` : ''}
                  {c.transitCost ? ` · ${fmtUsd(c.transitCost * trip.travelers)}` : ''}
                </div>
              ) : null}
              {c.foodPer ? <div>Food: {fmtUsd(c.foodPer)}/day</div> : null}
              {c.places.length ? (
                <div>Places: {c.places.map((p) => p.name).filter(Boolean).join(' · ')}</div>
              ) : null}
            </div>

            {days.map((day) => {
              const dt = dateOf(trip.start, day.n - 1);
              return (
                <div key={day.key} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '10pt', fontWeight: 600 }}>
                    Day {String(day.n).padStart(2, '0')} · {fmtDow(dt)} {fmtD(dt)}
                  </div>
                  {day.items.length ? (
                    day.items.map((it) => (
                      <div
                        key={it.id}
                        style={{
                          display: 'grid', gridTemplateColumns: '44pt 1fr auto', gap: '0 10pt',
                          fontSize: '10pt', padding: '3px 0', borderBottom: '1px dotted #d9dbe4',
                        }}
                      >
                        <span>{it.time || '—'}</span>
                        <span>
                          {it.title}
                          {it.note ? ' — ' + it.note : ''}
                        </span>
                        <span>{it.cost ? fmtUsd(it.cost) : ''}</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '10pt', color: '#75798c' }}>Nothing planned</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {doc.checklist.length ? (
        <div className="pc">
          <div style={{ fontSize: '13pt', fontWeight: 600, marginBottom: 6 }}>Checklist</div>
          {doc.checklist.map((c) => (
            <div key={c.id} style={{ fontSize: '10pt', padding: '2px 0' }}>
              {c.done ? '☑' : '☐'} {c.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
