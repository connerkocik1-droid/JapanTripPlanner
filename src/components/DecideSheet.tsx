'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { City, DayItem, Place, placeKind } from '@/lib/data';
import { fmtUsd } from '@/lib/format';
import { fmtSpan, parseClock } from '@/lib/dayPlan';
import { clashFor } from '@/lib/hours';
import { PERSON_LIST } from '@/lib/people';
import {
  Found, Pick, WeatherHint, askPicks, endsAt, goNowUrl, itemFromPick, lookUpPick,
} from '@/lib/decide';
import {
  QUESTIONS, type Answers, type QuestionId,
  flowFor, nextUnanswered, question,
} from '../../supabase/functions/draft-day/questions.ts';

export interface DecideSheetProps {
  open: boolean;
  onClose: () => void;
  /** The trip's own code — the only thing that gets the server to answer. */
  code: string | null;
  dayKey: string;
  city: City;
  /** The day as it stands, for where it ends and what time is left. */
  items: DayItem[];
  /** The weekday this day falls on, for what is shut. */
  weekday: number;
  /** YYYY-MM-DD, used to remember a budget answer for the rest of the day. */
  date: string;
  /** Minutes past midnight, during the trip. Null when planning ahead. */
  nowMins: number | null;
  weather: WeatherHint | null;
  /** What each traveler does not eat, and how to record it the first time. */
  diets: Record<string, string>;
  onSetDiet: (who: string, text: string) => void;
  onAdd: (item: DayItem) => void;
  /**
   * Save a place the trip did not have. Called before `onAdd` and only when
   * somebody accepts the card, so a suggestion nobody took leaves no trace.
   */
  onAddPlace: (place: Place) => void;
}

type Phase = 'diet' | 'ask' | 'thinking' | 'results';

const BUDGET_KEY = 'trip-planner:decide-budget:';

/**
 * "Help me decide" — a few chips, then three things to do next.
 *
 * One question a screen, because this gets used standing on a pavement with
 * one hand. Tapping an answer moves on by itself; there is no Next button to
 * find. The dots count the questions this run will actually ask, which
 * changes as you answer: saying Eat adds a screen about hunger, saying Do
 * something adds a different one about energy, and a question the app can
 * already answer for you is never shown.
 */
export default function DecideSheet(props: DecideSheetProps) {
  const { open, onClose, code, dayKey, city, items, weekday, date, nowMins, weather } = props;

  const [answers, setAnswers] = useState<Answers>({});
  const [picks, setPicks] = useState<Pick[]>([]);
  const [phase, setPhase] = useState<Phase>('ask');
  const [problem, setProblem] = useState('');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const abort = useRef<AbortController | null>(null);

  /** A budget answer given earlier today is reused rather than asked again. */
  const budgetToday = useMemo(() => (open ? readBudget(date) : ''), [open, date]);

  /** The next planned stop caps the time, so there is no point asking. */
  const timeCapMin = useMemo(() => {
    if (nowMins === null) return null;
    const next = items
      .map((it) => parseClock(it.time))
      .filter((m): m is number => m !== null && m > nowMins)
      .sort((a, b) => a - b)[0];
    return next === undefined ? null : next - nowMins;
  }, [items, nowMins]);

  const skips = useMemo(() => ({ budgetToday, timeCapMin }), [budgetToday, timeCapMin]);

  /** Nobody is asked what they cannot eat twice. */
  const unasked = PERSON_LIST.filter((p) => props.diets[p.id] === undefined);

  useEffect(() => {
    if (!open) return;
    setAnswers(budgetToday ? { budget: budgetToday } : {});
    setPicks([]);
    setProblem('');
    setAdded(new Set());
    setPhase(unasked.length ? 'diet' : 'ask');
    // `unasked` is derived from props.diets, which this does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayKey, budgetToday]);

  useEffect(() => () => abort.current?.abort(), []);

  const ask = useCallback(
    async (final: Answers) => {
      if (!code) {
        setProblem('This trip has no code yet, so there is nothing to ask against.');
        setPhase('results');
        return;
      }
      const ctrl = new AbortController();
      abort.current?.abort();
      abort.current = ctrl;

      setPicks([]);
      setProblem('');
      setPhase('thinking');

      await askPicks(
        code,
        dayKey,
        final,
        city.places,
        {
          onPick: (pick) => {
            setPhase('results');
            setPicks((cur) => [...cur, pick]);
          },
          onDone: (count) => {
            setPhase('results');
            if (!count) setProblem('Nothing here fits that right now. Try a different answer.');
          },
          onError: (message) => {
            setPhase('results');
            setProblem(message);
          },
        },
        { nowMins, weather, exclude: [] },
        ctrl.signal,
      );
    },
    [code, dayKey, city.places, nowMins, weather],
  );

  if (!open) return null;

  const flow = flowFor(answers, skips);
  const current = nextUnanswered(answers, skips);
  const step = current ? flow.indexOf(current) : flow.length;

  const answer = (id: QuestionId, value: string) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (id === 'budget') writeBudget(date, value);
    if (!nextUnanswered(next, skips)) void ask(next);
  };

  const back = () => {
    if (phase === 'results' || phase === 'thinking') {
      abort.current?.abort();
      const last = flow[flow.length - 1];
      setAnswers((cur) => ({ ...cur, [last]: undefined }));
      setPhase('ask');
      return;
    }
    const i = current ? flow.indexOf(current) : flow.length;
    if (i <= 0) {
      onClose();
      return;
    }
    const prev = flow[i - 1];
    setAnswers((cur) => ({ ...cur, [prev]: undefined }));
  };

  /**
   * Accepting a card. A pick at a saved place just becomes a stop; a pick at
   * somewhere new saves the place into the city first, so the stop has a pin
   * under it and the place is there to plan with afterwards.
   */
  const add = (pick: Pick, found: Place | null) => {
    const known = found ? [...city.places, found] : city.places;
    const item = itemFromPick({ ...pick, placeId: pick.placeId || found?.id || '' }, known);
    if (!item) return;
    if (found) props.onAddPlace(found);
    props.onAdd(item);
    setAdded((cur) => new Set(cur).add(pick.id));
  };

  return (
    <div style={scrim} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Help me decide">
        <div style={grabber} />

        <div style={bar}>
          <button className="tap" onClick={back} aria-label="Back" style={iconBtn}>
            <i className="ph ph-arrow-left" style={{ fontSize: 16 }} />
          </button>
          {phase === 'ask' ? (
            <div style={{ display: 'flex', gap: 5, flex: 1, justifyContent: 'center' }}>
              {flow.map((id, i) => (
                <span key={id} style={{ ...dot, opacity: i === step ? 1 : i < step ? 0.55 : 0.2 }} />
              ))}
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <button className="tap" onClick={onClose} aria-label="Close" style={iconBtn}>
            <i className="ph ph-x" style={{ fontSize: 16 }} />
          </button>
        </div>

        {phase === 'diet' ? (
          <DietStep people={unasked} onSet={props.onSetDiet} onDone={() => setPhase('ask')} />
        ) : null}

        {phase === 'ask' && current ? (
          <>
            <div style={askLine}>{question(current)?.ask}</div>
            <div className="mono" style={fromLine}>
              From {endsAt(city, items)}
            </div>
            <div style={chips}>
              {question(current)?.options.map((o) => (
                <button key={o.id} className="tap" onClick={() => answer(current, o.id)} style={chip}>
                  {o.label}
                </button>
              ))}
            </div>
            {step === 0 ? (
              <button
                className="tap"
                onClick={() => void ask({})}
                style={{ ...chip, width: '100%', marginTop: 4, borderStyle: 'dashed' }}
              >
                <i className="ph ph-shuffle" style={{ fontSize: 13, marginRight: 6 }} />
                Surprise me
              </button>
            ) : null}
          </>
        ) : null}

        {phase === 'thinking' ? (
          <div className="mono" style={{ ...fromLine, textAlign: 'center', padding: '28px 0' }}>
            Finding three things…
          </div>
        ) : null}

        {phase === 'results' ? (
          <>
            {picks.map((p) => (
              <PickCard
                key={p.id}
                pick={p}
                city={city}
                weekday={weekday}
                onTrip={nowMins !== null}
                added={added.has(p.id)}
                onAdd={(found) => add(p, found)}
              />
            ))}
            {problem ? (
              <div style={{ ...fromLine, color: 'var(--color-warn)', padding: '16px 0' }}>{problem}</div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Asked once per traveler, the first time anybody uses this. */
function DietStep({
  people,
  onSet,
  onDone,
}: {
  people: typeof PERSON_LIST;
  onSet: (who: string, text: string) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState<Record<string, string>>({});
  return (
    <>
      <div style={askLine}>Anything you don&rsquo;t eat?</div>
      <div className="mono" style={fromLine}>
        Asked once. Leave it blank if there is nothing.
      </div>
      {people.map((p) => (
        <div key={p.id} style={{ marginTop: 10 }}>
          <div className="mono" style={{ fontSize: 9.5, color: p.color, marginBottom: 4 }}>
            {p.name}
          </div>
          <input
            value={text[p.id] ?? ''}
            placeholder="Shellfish, pork, dairy…"
            aria-label={`What ${p.name} does not eat`}
            onChange={(e) => setText((cur) => ({ ...cur, [p.id]: e.target.value }))}
            style={field}
          />
        </div>
      ))}
      <button
        className="tap"
        onClick={() => {
          people.forEach((p) => onSet(p.id, text[p.id] ?? ''));
          onDone();
        }}
        style={{ ...chip, width: '100%', marginTop: 14, minHeight: 44, background: 'var(--tint-accent)' }}
      >
        Carry on
      </button>
    </>
  );
}

/**
 * One of the three answers.
 *
 * A pick at a saved place is drawn straight from it. A pick at somewhere the
 * trip has not got is looked up first — the map, then the details — and until
 * that comes back the card says so rather than showing a name with nothing
 * under it. If the lookup finds nothing, the card stays and says it could not
 * be placed, because a suggestion that quietly vanished is worse than one you
 * can see and ignore.
 */
function PickCard({
  pick,
  city,
  weekday,
  onTrip,
  added,
  onAdd,
}: {
  pick: Pick;
  city: City;
  weekday: number;
  /** True on the day being lived, which is the only time Go now is any use. */
  onTrip: boolean;
  added: boolean;
  onAdd: (found: Place | null) => void;
}) {
  const saved = city.places.find((p) => p.id === pick.placeId) ?? null;
  const [found, setFound] = useState<Found | null>(null);

  useEffect(() => {
    if (saved || !pick.query) return;
    const ctrl = new AbortController();
    void lookUpPick(pick, city, ctrl.signal).then((f) => {
      if (!ctrl.signal.aborted) setFound(f);
    });
    return () => ctrl.abort();
    // The pick never changes identity once it is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick.id]);

  if (!saved && !pick.query) return null;

  if (!saved && !found) {
    return (
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{pick.title}</div>
        <div className="mono" style={{ ...facts, marginTop: 7 }}>Looking it up…</div>
      </div>
    );
  }

  const place = saved ?? found?.place ?? null;
  if (!place) {
    return (
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{pick.title}</div>
        {pick.reason ? (
          <div style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginTop: 5, lineHeight: 1.45 }}>
            {pick.reason}
          </div>
        ) : null}
        <div className="mono" style={{ ...facts, color: 'var(--color-warn)' }}>
          {found?.problem || 'Could not find this one on the map.'}
        </div>
      </div>
    );
  }

  const isNew = !saved;
  const kind = placeKind(place.kind);
  const arrive = parseClock(pick.startTime);
  const clash = clashFor(place, weekday, arrive, arrive === null ? null : arrive + 60);
  const photo = place.images.find(Boolean);

  return (
    <div style={card}>
      {photo ? (
        // Place photographs are remote and of unknown size; next/image would
        // need every host declared, and this is one thumbnail on a card.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" style={shot} loading="lazy" />
      ) : null}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{place.name || pick.title}</span>
        <i className={`ph ${kind.icon}`} style={{ fontSize: 13, color: kind.color }} />
      </div>

      {pick.reason ? (
        <div style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginTop: 5, lineHeight: 1.45 }}>
          {pick.reason}
        </div>
      ) : null}

      <div className="mono" style={facts}>
        <span>{pick.startTime}</span>
        {pick.travelMin ? <span>· {fmtSpan(pick.travelMin)} away</span> : null}
        {pick.costPerPerson ? <span>· {fmtUsd(pick.costPerPerson)} each</span> : null}
        {place.rating ? <span>· {place.rating.toFixed(1)}★</span> : null}
        {isNew ? <span style={{ color: 'var(--color-accent-300)' }}>· NOT ON YOUR LIST</span> : null}
      </div>

      {clash ? (
        <div className="mono" style={{ ...facts, color: clash.weight === 'hard' ? 'var(--color-warn)' : 'var(--color-neutral-500)' }}>
          {clash.text}
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          className="tap"
          onClick={() => onAdd(isNew ? place : null)}
          disabled={added}
          style={{
            ...chip,
            flex: 1,
            minHeight: 40,
            background: added ? 'transparent' : 'var(--tint-accent)',
            opacity: added ? 0.55 : 1,
          }}
        >
          <i className={`ph ${added ? 'ph-check' : 'ph-plus'}`} style={{ fontSize: 13, marginRight: 6 }} />
          {added ? 'In the day' : 'Add to day'}
        </button>
        {onTrip ? (
          // Only on the day you are living: a route from where you are is not
          // something to tap a week in advance, and the link opens the map app
          // that can actually route there.
          <a
            className="tap"
            href={goNowUrl(city, place)}
            target="_blank"
            rel="noreferrer"
            style={{ ...chip, flex: 'none', padding: '0 14px', minHeight: 40, textDecoration: 'none' }}
          >
            <i className="ph ph-navigation-arrow" style={{ fontSize: 13, marginRight: 6 }} />
            Go now
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** The budget answer only holds for the day it was given on. */
function readBudget(date: string): string {
  try {
    return window.localStorage.getItem(BUDGET_KEY + date) ?? '';
  } catch {
    return '';
  }
}

function writeBudget(date: string, value: string): void {
  try {
    window.localStorage.setItem(BUDGET_KEY + date, value);
  } catch {
    /* private mode — it will simply ask again */
  }
}

const scrim = {
  position: 'fixed' as const,
  inset: 0,
  zIndex: 60,
  background: 'rgba(28, 20, 14, 0.42)',
  display: 'flex',
  alignItems: 'flex-end',
};

const sheet = {
  width: '100%',
  maxHeight: '86vh',
  overflowY: 'auto' as const,
  padding: '8px 16px 28px',
  borderRadius: '18px 18px 0 0',
  background: 'var(--color-surface)',
  boxShadow: '0 -10px 40px rgba(28, 20, 14, 0.25)',
};

const grabber = {
  width: 38,
  height: 4,
  margin: '0 auto 6px',
  borderRadius: 9999,
  background: 'var(--color-neutral-800)',
};

const bar = { display: 'flex', alignItems: 'center', gap: 8, minHeight: 40 };

const iconBtn = {
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-neutral-500)',
  cursor: 'pointer',
};

const dot = {
  width: 6,
  height: 6,
  borderRadius: 9999,
  background: 'var(--color-accent-500)',
  display: 'block',
};

const askLine = { fontSize: 18, fontWeight: 500, marginTop: 10, lineHeight: 1.3 };

const fromLine = { fontSize: 10, color: 'var(--color-neutral-500)', marginTop: 4 };

const chips = { display: 'flex', flexWrap: 'wrap' as const, gap: 8, marginTop: 16 };

const chip = {
  minHeight: 44,
  padding: '0 16px',
  borderRadius: 9999,
  border: '1px solid var(--color-accent-600)',
  background: 'transparent',
  color: 'var(--color-accent-200)',
  fontSize: 13.5,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const card = {
  marginTop: 12,
  padding: '12px 13px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-bg)',
};

const shot = {
  width: '100%',
  height: 128,
  objectFit: 'cover' as const,
  borderRadius: 'var(--radius-md)',
  marginBottom: 9,
  display: 'block',
};

const facts = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 5,
  marginTop: 6,
  fontSize: 9.5,
  color: 'var(--color-neutral-600)',
};

const field = {
  width: '100%',
  minHeight: 42,
  padding: '0 11px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-neutral-800)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  fontSize: 13.5,
};
