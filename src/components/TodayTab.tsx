'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { City, DayItem, Hotel, LatLng } from '@/lib/data';
import { hotelName } from '@/lib/hotelTier';
import {
  EXPENSE_CATEGORIES, Expense, ExpenseCategory, Insight, byCategory, dayStamp,
  expenseCategory, insightFor, insightSeen, markInsightSeen, onDay, sumUsd, usdOf,
} from '@/lib/expenses';
import { DayEntry } from '@/lib/derive';
import { DayPlan, fmtClock, fmtSpan } from '@/lib/dayPlan';
import { clashFor } from '@/lib/hours';
import { dateOf, fmtD, fmtDow, fmtUsd } from '@/lib/format';
import { LegOptions, betterMode, fmtDistance, fmtDuration, routeLeg } from '@/lib/routing';
import { daysToStart, inSpan, nowMins, progressOf } from '@/lib/today';
import { useHere } from '@/lib/useHere';
import { Local } from './CityMoney';
import { currency, fmtLocal, rateFor, toUsd, type Rates } from '@/lib/money';
import { describe, toC, useWeather, type Weather } from '@/lib/weather';

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
  /** The stored rates are from a day before today. */
  ratesStale: boolean;
  onRefreshRates: () => void;
  /** Every currency the trip spends in, in the order the cities come. */
  currencies: string[];
  travelers: number;
  /** Everything logged on the trip so far, newest first. */
  expenses: Expense[];
  onZoomStop: (ll: LatLng) => void;
  onToggleItem: (key: string, id: string) => void;
  onAddExpense: (e: {
    on: string; cityId: string; category: ExpenseCategory; amount: number;
    currency: string; rate: number; note: string;
  }) => void;
  onRemoveExpense: (id: string) => void;
  /**
   * What Claude can do for today, shown under the day's stops. Passed in
   * rather than built here, so this tab stays about following the day.
   */
  assist?: ReactNode;
  /** Open this day in the planner, for changing it rather than following it. */
  onEditDay: () => void;
  /** You have arrived: day one becomes today, and every day moves with it. */
  onStartToday: () => void;
}

/** The clock is read this often: often enough to be right, rarely enough to be free. */
const TICK_MS = 30_000;

/**
 * The day you are actually in.
 *
 * Every other tab is for planning — laying a day out, costing it, moving
 * things around. This one is for following the day you already planned, on a
 * phone, one-handed, in a city you do not know. So it answers four questions
 * and stops: where should I be now, when do I have to leave, how do I get back
 * to the hotel, and am I ahead or behind on the money.
 */
export default function TodayTab({
  schedule, start, todayN, dayEntry, plan, hotel, city, rates, ratesStale, onRefreshRates, currencies,
  travelers, expenses, onZoomStop, onToggleItem, onAddExpense, onRemoveExpense, assist, onEditDay,
  onStartToday,
}: TodayTabProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const here = useHere();
  const { weather } = useWeather(dayEntry?.city.ll ?? null);

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
    if (hotel?.ll) return { label: hotelName(hotel.name) || 'your hotel', ll: hotel.ll, home: true };
    return null;
  }, [dayEntry, prog?.next?.item, hotel]);

  const fromHere = useRouteFromHere(here.here?.ll ?? null, aim?.ll ?? null);

  /**
   * Today's read on the money. `schedule` is already every day of the trip with
   * its city and its stops, which is all a budget needs to know.
   */
  const stamp = dayStamp(now);
  const insight = useMemo<Insight | null>(
    () => (running ? insightFor(expenses, schedule, todayN ?? 0, stamp, travelers, start) : null),
    [running, expenses, schedule, todayN, stamp, travelers, start],
  );
  const logged = useMemo(() => onDay(expenses, stamp), [expenses, stamp]);

  /**
   * Which day's insight this device has already been shown. Read in an effect,
   * not at render: the server has no localStorage, and a card that appeared and
   * then vanished would be worse than one that arrives a beat late. Null means
   * not read yet, which shows nothing.
   */
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => setSeen(insightSeen()), []);
  const dismissInsight = useCallback(() => {
    markInsightSeen(stamp);
    setSeen(stamp);
  }, [stamp]);
  const showInsight = Boolean(insight) && seen !== null && seen !== stamp;

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
      {showInsight && insight ? (
        <Bulletin insight={insight} onDismiss={dismissInsight} />
      ) : null}

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
              <StartTrip planned={dt} onStart={onStartToday} />
            </>
          ) : (
            <>The trip is behind you. This is the last day you planned.</>
          )}
        </div>
      </div>

      {weather ? <WeatherCard weather={weather} place={dayEntry.city.name} /> : null}

      <RatesCard
        currencies={currencies}
        local={dayEntry.city.currency}
        rates={rates}
        stale={ratesStale}
        overrides={Object.fromEntries(schedule.map((e) => [e.city.currency, e.city.rate]))}
        onRefresh={onRefreshRates}
      />

      {running ? (
        <Spend
          stamp={stamp}
          city={dayEntry.city}
          rates={rates}
          budget={insight?.budgetToday ?? 0}
          logged={logged}
          onAdd={onAddExpense}
          onRemove={onRemoveExpense}
        />
      ) : (
        <div style={{ ...note, marginTop: 8 }}>
          Logging what you spend starts on day one, and lives here beside the day.
        </div>
      )}

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
            <div style={{ fontSize: 12.5 }}>Back to {hotelName(hotel.name) || 'your hotel'}</div>
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

      {assist}

      <button className="tap" onClick={onEditDay} style={editBtn}>
        <i className="ph ph-pencil-simple" style={{ fontSize: 12 }} /> Change this day
      </button>
    </div>
  );
}

/**
 * The day's money, once a day.
 *
 * It is the first thing on the tab the app opens on, and it goes away when it
 * is read — the running total below it is always there, so dismissing this
 * loses nothing. It says the day first, because that is the number you can
 * still do something about, and the trip second, because that is the one that
 * decides whether the last week is comfortable.
 */
function Bulletin({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  return (
    <div
      style={{
        ...card,
        marginBottom: 8,
        borderColor: 'var(--color-accent-500)',
        background: 'var(--tint-accent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <i className="ph-fill ph-coins" style={{ fontSize: 15, color: 'var(--color-accent-300)' }} />
        <div className="mono" style={{ fontSize: 9, color: 'var(--color-accent-300)', flex: 1 }}>
          DAY {insight.dayN} · THE MONEY
        </div>
        <button className="tap" onClick={onDismiss} aria-label="Dismiss" style={pinBtn}>
          <i className="ph ph-x" style={{ fontSize: 13 }} />
        </button>
      </div>
      <div style={{ marginTop: 5, fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
        {insight.today}
      </div>
      <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.45, color: 'var(--color-neutral-500)' }}>
        {insight.trip}
      </div>
    </div>
  );
}

/**
 * What today has cost, and the one tap that adds to it.
 *
 * Logging has to be quick or it does not happen: a figure, what it was for, and
 * done. The currency defaults to the one you are standing in, because that is
 * what the receipt says, and the dollars are worked out from the day's rate and
 * kept with the entry so the trip total does not move when the yen does.
 */
function Spend({
  stamp, city, rates, budget, logged, onAdd, onRemove,
}: {
  stamp: string;
  city: City;
  rates: Rates | null;
  /** What the plan budgets for today, in dollars. */
  budget: number;
  logged: Expense[];
  onAdd: TodayTabProps['onAddExpense'];
  onRemove: TodayTabProps['onRemoveExpense'];
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [noteText, setNoteText] = useState('');

  const cur = currency(city.currency);
  const rate = rateFor(city.currency, rates, city.rate);
  /** A local figure is only offered where a rate can price it. */
  const canLocal = Boolean(cur && rate);
  const [local, setLocal] = useState(true);
  const inLocal = canLocal && local;

  const spent = sumUsd(logged);
  const over = budget > 0 && spent > budget;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const cats = byCategory(logged);

  const value = Number(amount);
  const ready = Number.isFinite(value) && value > 0;

  function save() {
    if (!ready) return;
    onAdd({
      on: stamp,
      cityId: city.id,
      category,
      amount: value,
      currency: inLocal && cur ? cur.code : '',
      rate: inLocal && rate ? rate : 0,
      note: noteText.trim(),
    });
    setAmount('');
    setNoteText('');
  }

  return (
    <div style={{ ...card, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}>
            SPENT TODAY
          </div>
          <div className="num" style={{ fontSize: 17, fontWeight: 600 }}>
            {fmtUsd(spent)}
            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-neutral-500)' }}>
              {budget > 0 ? ` of ${fmtUsd(budget)} budgeted` : ' · no budget for today'}
            </span>
          </div>
        </div>
        <button
          className="tap"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            flex: 'none', minHeight: 38, padding: '0 13px', borderRadius: 9999, cursor: 'pointer',
            border: '1px solid var(--color-accent-500)',
            background: open ? 'var(--tint-accent)' : 'var(--color-accent-500)',
            color: open ? 'var(--color-accent-200)' : 'var(--color-on-accent)',
            fontSize: 12.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <i className={'ph ' + (open ? 'ph-x' : 'ph-plus')} style={{ fontSize: 13 }} />
          {open ? 'Close' : 'Log'}
        </button>
      </div>

      {budget > 0 ? (
        <div
          style={{
            marginTop: 7, height: 5, borderRadius: 9999, overflow: 'hidden',
            background: 'var(--color-neutral-800)',
          }}
        >
          <div
            style={{
              width: pct + '%', height: '100%',
              background: over ? 'var(--color-danger)' : 'var(--color-accent-400)',
            }}
          />
        </div>
      ) : null}

      {open ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              autoFocus
              value={amount}
              placeholder={inLocal && cur ? `Amount in ${cur.code}` : 'Amount in dollars'}
              aria-label={inLocal && cur ? `Amount in ${cur.name}` : 'Amount in dollars'}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
              }}
              className="num"
              style={{
                flex: 1, minWidth: 0, minHeight: 42, padding: '0 10px', fontSize: 16,
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
                background: 'var(--color-surface)', color: 'var(--color-text)',
              }}
            />
            {canLocal && cur ? (
              <button
                className="tap"
                onClick={() => setLocal((v) => !v)}
                aria-label={inLocal ? `Switch to dollars` : `Switch to ${cur.name}`}
                style={{
                  flex: 'none', width: 46, minHeight: 42, borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-neutral-800)', background: 'var(--color-surface)',
                  color: 'var(--color-accent-200)', fontSize: 17, cursor: 'pointer',
                }}
              >
                {inLocal ? cur.symbol : '$'}
              </button>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
            {EXPENSE_CATEGORIES.map((c) => {
              const on = c.id === category;
              return (
                <button
                  key={c.id}
                  className="tap"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={on}
                  style={{
                    minHeight: 34, padding: '0 10px', borderRadius: 9999, cursor: 'pointer',
                    border: '1px solid ' + (on ? 'var(--color-accent-500)' : 'var(--color-neutral-800)'),
                    background: on ? 'var(--tint-accent)' : 'transparent',
                    color: on ? 'var(--color-accent-200)' : 'var(--color-neutral-500)',
                    fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <i className={'ph ' + c.icon} style={{ fontSize: 13 }} />
                  {c.label}
                </button>
              );
            })}
          </div>

          <input
            value={noteText}
            placeholder="What it was, if it helps (optional)"
            aria-label="Note"
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
            style={{
              width: '100%', marginTop: 7, minHeight: 38, padding: '0 10px', fontSize: 13,
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
              background: 'var(--color-surface)', color: 'var(--color-text)',
            }}
          />

          <div className="mono" style={{ ...cap, marginTop: 7, minHeight: 12 }}>
            {inLocal && cur && rate && ready
              ? `${fmtLocal(value / rate, cur.code, rate)} · about ${fmtUsd(value / rate)}`
              : canLocal
                ? 'Tap the symbol to switch currency'
                : cur
                  ? 'No rate for this city yet, so this is in dollars'
                  : ''}
          </div>

          <button
            className="tap"
            onClick={save}
            disabled={!ready}
            style={{
              width: '100%', marginTop: 4, minHeight: 44, borderRadius: 'var(--radius-sm)',
              border: 'none', cursor: ready ? 'pointer' : 'default',
              background: ready ? 'var(--color-accent-500)' : 'var(--color-neutral-800)',
              color: ready ? 'var(--color-on-accent)' : 'var(--color-neutral-600)',
              fontSize: 13.5, fontWeight: 600,
            }}
          >
            Add it
          </button>
        </div>
      ) : cats.length ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {cats.map((c) => (
            <span
              key={c.id}
              className="mono num"
              style={{
                fontSize: 9.5, padding: '3px 7px', borderRadius: 9999,
                border: '1px solid var(--color-neutral-800)', color: 'var(--color-neutral-500)',
              }}
            >
              {expenseCategory(c.id).label} {fmtUsd(c.usd)}
            </span>
          ))}
        </div>
      ) : null}

      {logged.length ? (
        <div style={{ marginTop: 9 }}>
          {logged.map((e) => (
            <Entry key={e.id} expense={e} onRemove={() => onRemove(e.id)} />
          ))}
        </div>
      ) : (
        <div style={{ ...note, marginTop: open ? 9 : 7 }}>
          Nothing logged today. Every figure you add here is compared against what
          the day budgets.
        </div>
      )}
    </div>
  );
}

/** One logged expense: what it cost, what for, and a way to undo a fat finger. */
function Entry({ expense, onRemove }: { expense: Expense; onRemove: () => void }) {
  const dollars = usdOf(expense);
  const cat = expenseCategory(expense.category);
  const localText =
    expense.currency && expense.rate > 0
      ? fmtLocal(expense.amount / expense.rate, expense.currency, expense.rate)
      : null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
        borderTop: '1px solid var(--color-neutral-800)',
      }}
    >
      <i
        className={'ph ' + cat.icon}
        style={{ fontSize: 14, color: 'var(--color-accent-300)', flex: 'none' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {expense.note || cat.label}
        </div>
        {localText ? (
          <div className="mono num" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
            {localText}
          </div>
        ) : null}
      </div>
      <span className="num" style={{ flex: 'none', fontSize: 13, fontWeight: 600 }}>
        {dollars === null ? '—' : fmtUsd(dollars)}
      </span>
      <button
        className="tap"
        onClick={onRemove}
        aria-label={`Remove ${expense.note || cat.label}`}
        style={{ ...pinBtn, width: 30, height: 30, color: 'var(--color-neutral-600)' }}
      >
        <i className="ph ph-trash" style={{ fontSize: 12 }} />
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
        That is the day done. {hotel ? `Head back to ${hotelName(hotel.name) || 'the hotel'}.` : 'Nothing left on the list.'}
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

/**
 * "We're here." Before the trip, day one is a date on a calendar; this makes
 * it today, for the arrival that came early or the plan written with the
 * wrong date. Every day moves with it — the days are stored by city and
 * night, not by date — so nothing planned is lost. Two taps, because it
 * moves the whole trip.
 */
function StartTrip({ planned, onStart }: { planned: Date; onStart: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <div style={{ marginTop: 10 }}>
      <button
        className="tap start-trip"
        onClick={() => (armed ? onStart() : setArmed(true))}
        onBlur={() => setArmed(false)}
        style={{
          width: '100%', minHeight: 42, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          border: '1px solid var(--color-accent-500)',
          background: armed ? 'var(--color-accent-500)' : 'var(--tint-accent)',
          color: armed ? 'var(--color-on-accent)' : 'var(--color-accent-200)',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <i className={armed ? 'ph ph-check' : 'ph ph-airplane-landing'} style={{ fontSize: 15 }} />
        {armed ? 'Tap again to start today' : 'We\u2019re here \u2014 start the trip'}
      </button>
      {armed ? (
        <div style={note}>
          Day one moves from {fmtDow(planned)} {fmtD(planned)} to today, and every day after it
          moves with it. Nothing you planned is lost.
        </div>
      ) : null}
    </div>
  );
}

/** Now, the rest of today, and the next few hours, where the day is. */
function WeatherCard({ weather: w, place }: { weather: Weather; place: string }) {
  const now = describe(w.code, w.isDay);
  const old = Date.now() - Date.parse(w.at) > 3 * 60 * 60 * 1000;
  return (
    <div style={{ ...card, marginTop: 8 }}>
      <div className="mono" style={cap}>
        WEATHER IN {place.toUpperCase()}
        {old ? ' · LAST READ ' + new Date(w.at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' }) : ''}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <i className={'ph ' + now.icon} style={{ fontSize: 30, color: 'var(--color-accent-300)', flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="num" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1 }}>
            {w.tempF}°F
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-neutral-500)' }}>
              {' '}· {toC(w.tempF)}°C
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
            {now.text}
            {Math.abs(w.feelsF - w.tempF) >= 3 ? ` · feels like ${w.feelsF}°` : ''}
          </div>
        </div>
        <div className="mono num" style={{ fontSize: 10, textAlign: 'right', color: 'var(--color-neutral-500)', lineHeight: 1.6 }}>
          <div>H {w.highF}° · L {w.lowF}°</div>
          <div>
            <i className="ph ph-drop" /> {w.rainPct}% rain
          </div>
          {w.sunrise && w.sunset ? (
            <div>
              <i className="ph ph-sun-horizon" /> {w.sunrise}–{w.sunset}
            </div>
          ) : null}
        </div>
      </div>
      {w.hours.length ? (
        <div style={{ display: 'flex', gap: 4, marginTop: 9 }}>
          {w.hours.map((h) => (
            <div
              key={h.hour}
              className="mono num"
              style={{
                flex: '1 1 0', minWidth: 0, textAlign: 'center', fontSize: 9.5, padding: '5px 0',
                borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)',
                color: 'var(--color-neutral-500)',
              }}
            >
              <div>{h.hour}</div>
              <i className={'ph ' + describe(h.code).icon} style={{ fontSize: 15, color: 'var(--color-accent-300)' }} />
              <div style={{ color: 'var(--color-text)', fontSize: 11 }}>{h.tempF}°</div>
              {h.rainPct >= 20 ? <div>{h.rainPct}%</div> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What a dollar is worth in each currency the trip spends in, and the other
 * way round: type what the menu says, read it in dollars. The day's city
 * comes first, because that is the money in your pocket.
 */
function RatesCard({
  currencies, local, rates, stale, overrides, onRefresh,
}: {
  currencies: string[];
  local: string;
  rates: Rates | null;
  stale: boolean;
  overrides: Record<string, number>;
  onRefresh: () => void;
}) {
  const order = [...new Set([local, ...currencies])].filter((c) => currency(c));
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState(order[0] ?? '');
  useEffect(() => {
    if (!order.includes(code) && order[0]) setCode(order[0]);
  }, [order.join(','), code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!order.length) return null;

  const pick = currency(code);
  const rate = rateFor(code, rates, overrides[code] ?? 0);
  const usd = toUsd(Number(amount), rate);

  return (
    <div style={{ ...card, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="mono" style={{ ...cap, flex: 1, marginBottom: 0 }}>
          EXCHANGE RATES
          {rates ? (stale ? ` · AS OF ${fmtD(new Date(rates.date + 'T12:00')).toUpperCase()}` : ' · TODAY') : ''}
        </div>
        <button className="tap" onClick={onRefresh} aria-label="Refresh the rates" style={pinBtn}>
          <i className="ph ph-arrow-clockwise" style={{ fontSize: 14 }} />
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {order.map((c) => {
          const r = rateFor(c, rates, overrides[c] ?? 0);
          return (
            <div key={c} className="num" style={{ fontSize: c === local ? 16 : 13, fontWeight: c === local ? 600 : 400 }}>
              $1 = {r ? fmtLocal(1, c, r) : '—'}
              {(overrides[c] ?? 0) > 0 ? (
                <span className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-500)' }}> YOUR RATE</span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9 }}>
        {order.length > 1 ? (
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Currency to convert"
            style={{
              minHeight: 36, padding: '0 6px', borderRadius: 'var(--radius-sm)', fontSize: 12.5,
              border: '1px solid var(--color-neutral-800)', background: 'var(--color-surface)', color: 'var(--color-text)',
            }}
          >
            {order.map((c) => (
              <option key={c} value={c}>{currency(c)?.symbol} {c}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 14 }}>{pick?.symbol}</span>
        )}
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={amount}
          placeholder={`Price in ${pick?.name.toLowerCase() ?? code}`}
          aria-label={`Amount in ${code}`}
          onChange={(e) => setAmount(e.target.value)}
          className="num"
          style={{
            flex: 1, minWidth: 0, minHeight: 36, padding: '0 8px', fontSize: 13,
            borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-neutral-800)',
            background: 'var(--color-surface)',
          }}
        />
        <div className="num" style={{ minWidth: 64, textAlign: 'right', fontSize: 15, fontWeight: 600 }}>
          {usd !== null && amount ? fmtUsd(usd) : '$—'}
        </div>
      </div>
    </div>
  );
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
