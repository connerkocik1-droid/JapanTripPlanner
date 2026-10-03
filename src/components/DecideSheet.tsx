'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { City, DayItem, Place, placeKind } from '@/lib/data';
import { fmtUsd } from '@/lib/format';
import { fmtSpan, parseClock } from '@/lib/dayPlan';
import { clashFor } from '@/lib/hours';
import { PERSON_LIST, type Person } from '@/lib/people';
import type { Ask } from '@/lib/asks';
import {
  Found, Pick, WeatherHint, askPicks, endsAt, goNowUrl, itemFromPick, logRound, lookUpPick,
  markTaken,
} from '@/lib/decide';
import {
  QUESTIONS, REROLL, REROLL_ASK, type Answers, type QuestionId, type RerollId,
  cleanAnswers, flowFor, mergeAnswers, nextUnanswered, question, reroll, summaryChips,
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

  /** Who is holding the phone, for the record of what gets chosen. */
  me: string | null;
  /** The other traveler, when there is one to ask. */
  other: Person | null;
  /** My own invitation on this day, which is what the waiting screen watches. */
  mine: Ask | null;
  /**
   * Their invitation, when the sheet was opened to answer it rather than to
   * ask. The questions are the same; what happens at the end is not.
   */
  joining: Ask | null;
  /**
   * What was just asked for, so the mood above the day's place list says the
   * same thing. Asking here is the easiest way to set it.
   */
  onLens: (answers: Answers) => void;
  onStartAsk: (answers: Answers) => void;
  onAnswerAsk: (id: string, answers: Answers) => void;
  onEndAsk: (id: string) => void;
}

type Phase = 'diet' | 'ask' | 'thinking' | 'results' | 'reroll' | 'waiting' | 'sent';

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
  /**
   * The one question a re-roll asks, which is not the same as the next
   * unanswered one. "Surprise me" answers nothing, so walking the flow would
   * turn "Not the vibe" into the whole questionnaire.
   */
  const [onlyAsk, setOnlyAsk] = useState<QuestionId | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  /** What was sent to the asker, for the one line the sender is left with. */
  const [sent, setSent] = useState<Answers>({});
  /** True once both travelers' answers are what the picks were found from. */
  const [together, setTogether] = useState(false);
  /**
   * Everything offered so far this sitting, so a re-roll comes back with
   * three others. Saved places are excluded by the server, which builds the
   * list it offers; somewhere new has no id to exclude by, so its search
   * phrase is dropped here instead.
   */
  const shown = useRef<{ ids: string[]; queries: Set<string> }>({ ids: [], queries: new Set() });
  /**
   * The row this round was written down as, and an acceptance that arrived
   * before the row did. Tapping Add to day a second after the cards appear is
   * normal, and that tap is the whole point of keeping the record.
   */
  const round = useRef<{ id: string | null; took: { pick: Pick; name: string } | null }>({ id: null, took: null });
  /** Once a re-roll has started, every later ask keeps the exclusions. */
  const rerolling = useRef(false);
  const abort = useRef<AbortController | null>(null);
  /** The answers as they stand, for the effect that merges theirs into them. */
  const answersRef = useRef<Answers>({});
  answersRef.current = answers;

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
    shown.current = { ids: [], queries: new Set() };
    rerolling.current = false;
    round.current = { id: null, took: null };
    setOnlyAsk(null);
    setSent({});
    setTogether(false);
    setPhase(unasked.length ? 'diet' : 'ask');
    // `unasked` is derived from props.diets, which this does not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dayKey, budgetToday]);

  useEffect(() => () => abort.current?.abort(), []);

  /**
   * Keep the round. It is a note to ourselves and nothing on screen depends on
   * it, so a failure here is silent on purpose: the three cards are already up
   * and there is nothing a traveler could do about a log that did not land.
   */
  const write = useCallback(
    async (final: Answers, got: Pick[]) => {
      if (!code || !got.length) return;
      const id = await logRound(code, dayKey, props.me ?? '', final, got);
      round.current.id = id;
      const took = round.current.took;
      // Accepted while the row was still being written.
      if (id && took) {
        round.current.took = null;
        markTaken(code, id, took.pick, took.name);
      }
    },
    [code, dayKey, props.me],
  );

  const ask = useCallback(
    async (final: Answers, again = false) => {
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
      props.onLens(final);
      round.current = { id: null, took: null };
      /** This round's three, kept here rather than in state so `onDone` has them. */
      const got: Pick[] = [];

      await askPicks(
        code,
        dayKey,
        final,
        city.places,
        {
          onPick: (pick) => {
            // A new place has no id for the server to exclude by, so a repeat
            // of one already turned down is dropped here.
            const q = pick.query.trim().toLowerCase();
            if (q && shown.current.queries.has(q)) return;
            if (q) shown.current.queries.add(q);
            if (pick.placeId) shown.current.ids.push(pick.placeId);
            got.push(pick);
            setPhase('results');
            setPicks((cur) => [...cur, pick]);
          },
          onDone: (count) => {
            setPhase('results');
            if (!count) setProblem('Nothing here fits that right now. Try a different answer.');
            if (count) void write(final, got);
          },
          onError: (message) => {
            setPhase('results');
            setProblem(message);
          },
        },
        { nowMins, weather, exclude: again ? shown.current.ids : [] },
        ctrl.signal,
      );
    },
    // `write` is a ref-only helper and does not change between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [code, dayKey, city.places, nowMins, weather, props.me],
  );

  /**
   * Their answers landing, which is the one thing this screen is waiting for.
   *
   * It arrives on a pull from the other phone, so it shows up as a changed
   * prop rather than as anything happening here. The invitation comes down at
   * the same moment: it has been answered, and leaving it standing would offer
   * the other phone a second go at a question already settled.
   */
  const reply = props.mine?.reply ?? null;
  const mineId = props.mine?.id ?? null;
  useEffect(() => {
    if (phase !== 'waiting' || !reply || !mineId) return;
    // Their answers arrived from another device, so they are checked against
    // the question table before they are merged — with nothing skipped, since
    // what this phone already knew is no reason to drop what they said.
    const merged = mergeAnswers(answersRef.current, cleanAnswers(reply, {}));
    setAnswers(merged);
    setTogether(true);
    props.onEndAsk(mineId);
    void ask(merged, rerolling.current);
    // Their answers are the trigger; everything else is read at the moment it
    // fires rather than being a reason to fire again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reply, mineId]);

  if (!open) return null;

  const flow = flowFor(answers, skips);
  const current = onlyAsk ?? nextUnanswered(answers, skips);
  const step = current ? flow.indexOf(current) : flow.length;

  /**
   * The end of the questions, which is two different things.
   *
   * Answering your own question asks Claude. Answering somebody else's sends
   * your answers to their phone, because they are the one standing there
   * waiting and three picks on both phones would be three different sets.
   */
  const finish = (final: Answers) => {
    if (props.joining) {
      props.onAnswerAsk(props.joining.id, final);
      setSent(final);
      setPhase('sent');
      return;
    }
    void ask(final, rerolling.current);
  };

  /** Put the question to the other traveler, with mine already answered. */
  const askTogether = () => {
    props.onStartAsk(answers);
    setPhase('waiting');
  };

  /** Done waiting. The three already on screen were always there. */
  const goAlone = () => {
    if (props.mine) props.onEndAsk(props.mine.id);
    setPhase(picks.length ? 'results' : 'ask');
  };

  /**
   * Closing while somebody is still being waited on takes the question down,
   * so it is not sitting on the other phone an hour later.
   */
  const close = () => {
    if (props.mine && !props.mine.reply) props.onEndAsk(props.mine.id);
    onClose();
  };

  const answer = (id: QuestionId, value: string) => {
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (id === 'budget') writeBudget(date, value);
    if (onlyAsk) {
      // The one question a re-roll asked. Whatever else is unanswered stays
      // that way: they asked for three different ones, not a questionnaire.
      setOnlyAsk(null);
      void ask(next, true);
      return;
    }
    if (!nextUnanswered(next, skips)) finish(next);
  };

  /**
   * Turning all three down. One answer moves, and the next three come back
   * without the ones already seen. "Not the vibe" is the only one that has to
   * ask anything, because it is the only one that cannot be guessed from the
   * complaint.
   */
  const again = (how: RerollId) => {
    const next = reroll(answers, how);
    rerolling.current = true;
    setAnswers(next);
    if (how === 'vibe') {
      setOnlyAsk('vibe');
      setPhase('ask');
      return;
    }
    void ask(next, true);
  };

  const back = () => {
    if (phase === 'waiting') {
      goAlone();
      return;
    }
    if (phase === 'sent') {
      close();
      return;
    }
    if (phase === 'reroll' || onlyAsk) {
      setOnlyAsk(null);
      setPhase('results');
      return;
    }
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
    // Which of the three was taken is the one fact worth keeping about a round.
    const name = item.title;
    if (code && round.current.id) markTaken(code, round.current.id, pick, name);
    else round.current.took = { pick, name };
  };

  return (
    <div style={scrim} onClick={close}>
      <div style={sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Help me decide">
        <div style={grabber} />

        <div style={bar}>
          <button className="tap" onClick={back} aria-label="Back" style={iconBtn}>
            <i className="ph ph-arrow-left" style={{ fontSize: 16 }} />
          </button>
          {phase === 'ask' && !onlyAsk ? (
            <div style={{ display: 'flex', gap: 5, flex: 1, justifyContent: 'center' }}>
              {flow.map((id, i) => (
                <span key={id} style={{ ...dot, opacity: i === step ? 1 : i < step ? 0.55 : 0.2 }} />
              ))}
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <button className="tap" onClick={close} aria-label="Close" style={iconBtn}>
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
              {props.joining && props.other
                ? `${props.other.name} is deciding too · from ${endsAt(city, items)}`
                : `From ${endsAt(city, items)}`}
            </div>
            <div style={chips}>
              {question(current)?.options.map((o) => (
                <button key={o.id} className="tap" onClick={() => answer(current, o.id)} style={chip}>
                  {o.label}
                </button>
              ))}
            </div>
            {step === 0 && !onlyAsk && !props.joining ? (
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
            {together && props.other ? (
              <div className="mono" style={{ ...fromLine, marginTop: 10 }}>
                Both of you · {summaryChips(answers).map((c) => c.label).join(' · ')}
              </div>
            ) : null}
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
            {picks.length ? (
              <button
                className="tap"
                onClick={() => setPhase('reroll')}
                style={{ ...chip, width: '100%', marginTop: 12, borderStyle: 'dashed' }}
              >
                <i className="ph ph-arrows-clockwise" style={{ fontSize: 13, marginRight: 6 }} />
                Not these
              </button>
            ) : null}
            {picks.length && props.other && !together ? (
              <button
                className="tap"
                onClick={askTogether}
                style={{ ...chip, width: '100%', marginTop: 8, borderStyle: 'dashed' }}
              >
                <i className="ph ph-users-two" style={{ fontSize: 13, marginRight: 6 }} />
                Ask {props.other.name} too
              </button>
            ) : null}
          </>
        ) : null}

        {phase === 'waiting' ? (
          <>
            <div style={askLine}>Asked {props.other?.name ?? 'them'}.</div>
            <div className="mono" style={fromLine}>
              Their answers come through when they open the app. Yours so far:{' '}
              {summaryChips(answers).map((c) => c.label).join(' · ') || 'nothing in particular'}
            </div>
            <button
              className="tap"
              onClick={goAlone}
              style={{ ...chip, width: '100%', marginTop: 16, borderStyle: 'dashed' }}
            >
              <i className="ph ph-arrow-left" style={{ fontSize: 13, marginRight: 6 }} />
              Back to the three you had
            </button>
          </>
        ) : null}

        {phase === 'sent' ? (
          <>
            <div style={askLine}>Sent to {props.other?.name ?? 'them'}.</div>
            <div className="mono" style={fromLine}>
              They are the one with the three cards. You said:{' '}
              {summaryChips(sent).map((c) => c.label).join(' · ') || 'nothing in particular'}
            </div>
            <button
              className="tap"
              onClick={close}
              style={{ ...chip, width: '100%', marginTop: 16, background: 'var(--tint-accent)' }}
            >
              Done
            </button>
          </>
        ) : null}

        {phase === 'reroll' ? (
          <>
            <div style={askLine}>{REROLL_ASK}</div>
            <div className="mono" style={fromLine}>
              Three different ones, without the ones you just saw.
            </div>
            <div style={chips}>
              {REROLL.map((o) => (
                <button key={o.id} className="tap" onClick={() => again(o.id)} style={chip}>
                  {o.label}
                </button>
              ))}
            </div>
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
