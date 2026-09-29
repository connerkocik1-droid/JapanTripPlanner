'use client';

import { useEffect, useMemo, useState } from 'react';
import { City, DayItem, Hotel, LatLng } from '@/lib/data';
import { DayEntry } from '@/lib/derive';
import { DayPlan, fmtClock, fmtSpan } from '@/lib/dayPlan';
import { clashFor } from '@/lib/hours';
import { dateOf, fmtD, fmtDow, fmtUsd } from '@/lib/format';
import { LegOptions, betterMode, fmtDistance, fmtDuration, routeLeg } from '@/lib/routing';
import { daysToStart, inSpan, nowMins, progressOf } from '@/lib/today';
import { useHere } from '@/lib/useHere';
import { Local } from './CityMoney';
import type { Rates } from '@/lib/money';

export interface TodayTabProps {
  schedule: DayEntry[];
  start: string;
  /** Which day of the trip today is, 1-indexed, or null when it is not one. */
  todayN: number | null;
  /** The day being shown — today's while the trip runs, else the first. */
  dayEntry: DayEntry | null;
  plan: DayPlan | null;
  hotel: Hotel | null;
  city: City | null;
  rates: Rates | null;
  travelers: number;
  onZoomStop: (ll: LatLng) => void;
  onToggleItem: (key: string, id: string) => void;
  /** Open this day in the planner, for changing it rather than following it. */
  onEditDay: () => void;
}

/** The clock is read this often: often enough to be right, rarely enough to be free. */
const TICK_MS = 30_000;

/**
 * The day you are actually in.
 *
 * Every other tab is for planning — laying a day out, costing it, moving
 * things around. This one is for following the day you already planned, on a
 * phone, one-handed, in a city you do not know. So it answers three questions
 * and stops: where should I be now, when do I have to leave, and how do I get
 * back to the hotel.
 */
export default function TodayTab({
  schedule, start, todayN, dayEntry, plan, hotel, city, rates, travelers,
  onZoomStop, onToggleItem, onEditDay,
}: TodayTabProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const here = useHere();

  const mins = nowMins(now);
  const running = todayN !== null;
  const prog = useMemo(() => (running ? progressOf(plan, mins) : null), [running, plan, mins]);

  /**
   * What you are heading for: the next stop, or the hotel once the stops are
   * behind you. It is what the "where am I" button routes to, because it is
   * the only place you are trying to get to.
   */
  const aim = useMemo(() => {
    if (!dayEntry) return null;
    const nextItem = prog?.next?.item ?? null;
    if (nextItem) {
      const place = dayEntry.city.places.find((p) => p.id === nextItem.placeId);
      if (place?.ll) return { label: nextItem.title || place.name, ll: place.ll, home: false };
    }
    if (hotel?.ll) return { label: hotel.name || 'your hotel', ll: hotel.ll, home: true };
    return null;
  }, [dayEntry, prog?.next?.item, hotel]);

  const fromHere = useRouteFromHere(here.here?.ll ?? null, aim?.ll ?? null);

  if (!schedule.length) {
    return <div style={empty}>Nothing to follow yet — plan a day and it shows up here on the day.</div>;
  }
  if (!dayEntry) {
    return <div style={empty}>Add a city and its days show up here.</div>;
  }

  const dt = dateOf(start, dayEntry.n - 1);
  const weekday = dt.getDay();
  const items = dayEntry.items;
  const toStart = daysToStart(start, now);

  return (
    <div>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 21 }}>
            {running ? 'Today' : toStart > 0 ? 'Not yet' : 'Trip over'}
          </div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--color-neutral-500)', flex: 1 }}>
            {fmtDow(dt)} {fmtD(dt)} · Day {dayEntry.n} · {dayEntry.city.name}
          </div>
          {running ? (
            <div className="num" style={{ fontSize: 17, fontWeight: 600 }}>{fmtClock(mins)}</div>
          ) : null}
        </div>

        <div style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.45 }}>
          {running ? (
            <Headline plan={plan} prog={prog} hotel={hotel} />
          ) : toStart > 0 ? (
            <>
              {toStart === 1 ? 'You leave tomorrow.' : `You leave in ${toStart} days.`} Here is what
              day one looks like, so you know what this tab will show you on the trip.
            </>
          ) : (
            <>The trip is behind you. This is the last day you planned.</>
          )}
        </div>
      </div>

      {running && aim ? (
        <div style={{ ...card, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)', flex: 1 }}>
              {aim.home ? 'GETTING BACK' : 'GETTING THERE'}
            </div>
            <button
              className="tap"
              onClick={here.here ? here.clear : here.locate}
              disabled={!here.supported || here.state === 'looking'}
              style={{
                minHeight: 34, padding: '0 11px', borderRadius: 9999, cursor: 'pointer',
                border: '1px solid var(--color-accent-500)',
                background: here.here ? 'var(--tint-accent)' : 'transparent',
                color: 'var(--color-accent-200)', fontSize: 11.5,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <i className="ph ph-crosshair-simple" style={{ fontSize: 13 }} />
              {here.state === 'looking' ? 'Finding you…' : here.here ? 'Clear' : 'Where am I?'}
            </button>
          </div>

          <div style={{ marginTop: 7, fontSize: 13 }}>
            {aim.home ? 'Back to ' : 'Next: '}
            <strong style={{ fontWeight: 600 }}>{aim.label}</strong>
          </div>

          {here.state === 'denied' ? (
            <div style={note}>
              Location is off for this app. The plan&rsquo;s own timings still work — this only adds
              the leg from wherever you are standing.
            </div>
          ) : here.state === 'failed' ? (
            <div style={note}>Could not get a fix. Try again outside, or near a window.</div>
          ) : !here.supported ? (
            <div style={note}>This browser will not share a location.</div>
          ) : !here.here ? (
            <div style={note}>
              Tap &ldquo;Where am I?&rdquo; and this becomes the leg from where you are standing,
              not from the last stop.
            </div>
          ) : fromHere.loading ? (
            <div style={note}>Routing from where you are…</div>
          ) : fromHere.best ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <i
                className={
                  'ph ' + (fromHere.best.mode === 'walk' ? 'ph-person-simple-walk' : 'ph-train-simple')
                }
                style={{ fontSize: 17, color: 'var(--color-accent-300)', flex: 'none' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="num" style={{ fontSize: 15, fontWeight: 600 }}>
                  {fmtDuration(fromHere.best.seconds)}
                  <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-neutral-500)' }}>
                    {fromHere.best.mode === 'walk' ? ' on foot' : ' by metro'}
                  </span>
                </div>
                <div className="mono num" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
                  {fmtDistance(fromHere.best.meters)}
                  {here.here.accuracy ? ` · fix good to ${here.here.accuracy} m` : ''}
                  {fromHere.best.estimated ? ' · EST' : ''}
                </div>
              </div>
              <button
                className="tap"
                onClick={() => onZoomStop(aim.ll)}
                aria-label="Show on the map"
                style={pinBtn}
              >
                <i className="ph ph-map-pin" style={{ fontSize: 14 }} />
              </button>
            </div>
          ) : (
            <div style={note}>No route found from where you are.</div>
          )}
        </div>
      ) : null}

      <div className="mono" style={{ ...cap, marginTop: 14 }}>
        {running && !prog?.done ? 'THE REST OF THE DAY' : 'THE DAY'}
      </div>

      {items.length === 0 ? (
        <div style={empty}>Nothing planned for this day.</div>
      ) : (
        items.map((it, i) => (
          <Row
            key={it.id}
            item={it}
            index={i}
            state={prog?.states[i] ?? 'coming'}
            live={running}
            arrive={plan?.stops[i]?.arrive ?? null}
            depart={plan?.stops[i]?.depart ?? null}
            travelMins={plan?.stops[i]?.travelMins ?? null}
            clash={clashFor(
              dayEntry.city.places.find((p) => p.id === it.placeId) ?? null,
              weekday,
              plan?.stops[i]?.arrive ?? null,
              plan?.stops[i]?.depart ?? null,
            )}
            onToggle={() => onToggleItem(dayEntry.key, it.id)}
            onZoom={() => {
              const p = dayEntry.city.places.find((pl) => pl.id === it.placeId);
              if (p?.ll) onZoomStop(p.ll);
            }}
          />
        ))
      )}

      {plan?.back && hotel ? (
        <div style={{ ...card, marginTop: 8, display: 'flex', alignItems: 'center', gap: 9 }}>
          <i
            className="ph ph-arrow-u-down-left"
            style={{ fontSize: 15, color: 'var(--color-accent-300)', flex: 'none' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5 }}>Back to {hotel.name || 'your hotel'}</div>
            <div className="mono num" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
              {fmtSpan(plan.back.mins)}{' '}
              {plan.back.mode !== 'transit' ? 'on foot' : plan.back.rail ? 'by train' : 'by metro'}
              {plan.back.cost ? ` · ${fmtUsd(plan.back.cost)}` : ''}
              {travelers > 1 && plan.back.cost ? ` for ${travelers}` : ''}
            </div>
            <Local usd={plan.back.cost} city={city} rates={rates} align="left" />
          </div>
          <span className="mono num" style={{ flex: 'none', fontSize: 10, color: 'var(--color-accent-300)' }}>
            {fmtClock(plan.startMins + plan.totalMins)}
          </span>
        </div>
      ) : null}

      <button className="tap" onClick={onEditDay} style={editBtn}>
        <i className="ph ph-pencil-simple" style={{ fontSize: 12 }} /> Change this day
      </button>
    </div>
  );
}

/** The one line at the top: where you should be, and when you have to move. */
function Headline({
  plan, prog, hotel,
}: {
  plan: DayPlan | null;
  prog: ReturnType<typeof progressOf>;
  hotel: Hotel | null;
}) {
  if (!plan || !prog || !plan.stops.length) {
    return <>Nothing planned for today. A free day is a fine thing.</>;
  }
  if (prog.done) {
    return (
      <>
        That is the day done. {hotel ? `Head back to ${hotel.name || 'the hotel'}.` : 'Nothing left on the list.'}
      </>
    );
  }
  if (prog.early && prog.next) {
    const wait = prog.next.arrive - prog.at;
    return (
      <>
        The day starts at <strong>{fmtClock(prog.next.arrive)}</strong> at{' '}
        <strong>{prog.next.item.title || 'your first stop'}</strong>
        {wait > 0 ? <> — {inSpan(wait)}.</> : '.'}
      </>
    );
  }
  if (prog.here) {
    const left = prog.here.depart - prog.at;
    return (
      <>
        You should be at <strong>{prog.here.item.title || 'this stop'}</strong> until{' '}
        <strong>{fmtClock(prog.here.depart)}</strong>
        {left > 0 ? <> — {fmtSpan(left)} left.</> : '.'}
        {prog.next ? <> Then {prog.next.item.title || 'the next stop'}.</> : null}
      </>
    );
  }
  if (prog.next) {
    return (
      <>
        On your way to <strong>{prog.next.item.title || 'the next stop'}</strong>, due at{' '}
        <strong>{fmtClock(prog.next.arrive)}</strong>
        {prog.leaveAt !== null && prog.leaveAt > prog.at ? (
          <> — leave by {fmtClock(prog.leaveAt)}.</>
        ) : (
          '.'
        )}
      </>
    );
  }
  return <>Nothing left on today&rsquo;s list.</>;
}

/** One stop, read rather than edited: done, here now, or still to come. */
function Row({
  item, index, state, live, arrive, depart, travelMins, clash, onToggle, onZoom,
}: {
  item: DayItem;
  index: number;
  state: 'done' | 'here' | 'coming';
  /** False before the trip, when nothing is "now" and nothing is dimmed. */
  live: boolean;
  arrive: number | null;
  depart: number | null;
  travelMins: number | null;
  clash: ReturnType<typeof clashFor>;
  onToggle: () => void;
  onZoom: () => void;
}) {
  const past = live && state === 'done';
  const now = live && state === 'here';
  const hard = clash?.weight === 'hard';

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 9, marginTop: 6, padding: '9px 10px',
        borderRadius: 'var(--radius-md)',
        border:
          '1px solid ' +
          (hard ? 'var(--color-danger)' : now ? 'var(--color-accent-400)' : 'var(--color-neutral-800)'),
        background: now ? 'var(--tint-accent)' : 'var(--color-surface)',
        opacity: past ? 0.5 : 1,
      }}
    >
      <button
        className="tap"
        onClick={onToggle}
        aria-label={item.done ? 'Mark not done' : 'Mark done'}
        aria-pressed={item.done}
        style={{
          flex: 'none', width: 26, height: 26, borderRadius: 9999, padding: 0, cursor: 'pointer',
          border: '1px solid ' + (item.done ? 'var(--color-accent-500)' : 'var(--color-neutral-700)'),
          background: item.done ? 'var(--color-accent-500)' : 'transparent',
          color: item.done ? 'var(--color-on-accent)' : 'var(--color-neutral-500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
        }}
      >
        {item.done ? <i className="ph-fill ph-check" /> : <span className="num">{index + 1}</span>}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5, fontWeight: now ? 600 : 500,
            textDecoration: item.done ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {item.title || 'Untitled stop'}
        </div>
        <div className="mono num" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
          {arrive !== null ? fmtClock(arrive) : '—'}
          {depart !== null && depart !== arrive ? `–${fmtClock(depart)}` : ''}
          {travelMins ? ` · ${fmtSpan(travelMins)} to get here` : ''}
        </div>
        {clash ? (
          <div
            style={{
              fontSize: 10.5, marginTop: 3,
              color: hard ? 'var(--color-danger)' : 'var(--color-warn)',
            }}
          >
            {clash.text}
          </div>
        ) : null}
      </div>

      {now ? (
        <span className="mono" style={{ ...cap, flex: 'none', color: 'var(--color-accent-300)' }}>NOW</span>
      ) : null}
      <button className="tap" onClick={onZoom} aria-label="Show on the map" style={pinBtn}>
        <i className="ph ph-map-pin" style={{ fontSize: 13 }} />
      </button>
    </div>
  );
}

/**
 * The leg from where you are standing to where you are going. Nothing is
 * requested until there is a fix to route from, so the tab costs nothing until
 * the button is pressed.
 */
function useRouteFromHere(from: LatLng | null, to: LatLng | null) {
  const [options, setOptions] = useState<LegOptions>({});
  const [loading, setLoading] = useState(false);
  const sig = from && to ? `${from[0].toFixed(4)},${from[1].toFixed(4)}>${to[0]},${to[1]}` : '';

  useEffect(() => {
    if (!from || !to) {
      setOptions({});
      return;
    }
    let live = true;
    setLoading(true);
    routeLeg(from, to, ['walk', 'transit'])
      .then((o) => live && setOptions(o))
      .catch(() => live && setOptions({}))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const pick = betterMode(options);
  return { loading, best: (pick ? options[pick] : null) ?? options.walk ?? options.transit ?? null };
}

const card = {
  padding: '11px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-surface)',
};

const cap = {
  fontSize: 9,
  color: 'var(--color-neutral-500)',
  marginBottom: 2,
};

const note = {
  marginTop: 7,
  fontSize: 11,
  lineHeight: 1.45,
  color: 'var(--color-neutral-600)',
};

const empty = {
  padding: 18,
  borderRadius: 'var(--radius-md)',
  border: '1px dashed var(--color-neutral-800)',
  color: 'var(--color-neutral-600)',
  fontSize: 12.5,
  textAlign: 'center' as const,
  lineHeight: 1.5,
};

const pinBtn = {
  flex: 'none' as const,
  width: 34,
  height: 34,
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-accent-300)',
  cursor: 'pointer',
};

const editBtn = {
  width: '100%',
  marginTop: 12,
  minHeight: 42,
  borderRadius: 'var(--radius-sm)',
  border: '1px dashed var(--color-neutral-800)',
  background: 'transparent',
  color: 'var(--color-neutral-500)',
  fontSize: 12,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};
