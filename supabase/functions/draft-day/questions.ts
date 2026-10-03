/**
 * The questions "Help me decide" asks, and the rules about which of them
 * apply.
 *
 * This file is the one copy, read by both halves. The sheet on the phone
 * renders these chips, and the edge function checks the answers that come
 * back against the very same table before a word of them reaches Claude. That
 * is what keeps the endpoint from being a way to put arbitrary text in front
 * of the model: an answer is not a string the caller chose, it is one of a
 * handful of ids named here, and anything else is dropped.
 *
 * Pure data and pure functions — no Deno, no React, no network.
 */

export type QuestionId = 'after' | 'hunger' | 'vibe' | 'energy' | 'budget' | 'distance' | 'time';

export interface Option {
  id: string;
  label: string;
  /** How the answer is put to Claude, in words rather than as an id. */
  says: string;
}

export interface Question {
  id: QuestionId;
  /** The line at the top of the screen. */
  ask: string;
  options: Option[];
}

export const QUESTIONS: Question[] = [
  {
    id: 'after',
    ask: 'What are you after?',
    options: [
      { id: 'eat', label: 'Eat', says: 'somewhere to eat' },
      { id: 'drink', label: 'Drink', says: 'somewhere to drink' },
      { id: 'do', label: 'Do something', says: 'something to do' },
      { id: 'wander', label: 'Just wander', says: 'somewhere to wander' },
    ],
  },
  {
    id: 'hunger',
    ask: 'How hungry are you?',
    options: [
      { id: 'snack', label: 'Snack', says: 'only a snack' },
      { id: 'meal', label: 'Real meal', says: 'a proper meal' },
      { id: 'starving', label: 'Starving', says: 'starving, so somewhere substantial and quick to be seated' },
      { id: 'feast', label: 'Make it a feast', says: 'a feast — the big version of dinner' },
    ],
  },
  {
    id: 'vibe',
    ask: "What's the vibe?",
    options: [
      { id: 'chill', label: 'Chill', says: 'calm and unhurried' },
      { id: 'lively', label: 'Lively', says: 'busy and lively' },
      { id: 'local', label: 'Something local', says: 'where locals actually go, not where visitors are sent' },
      { id: 'treat', label: 'Treat ourselves', says: 'a treat, worth making an occasion of' },
      { id: 'weird', label: 'Something weird', says: 'odd, memorable, not the obvious choice' },
    ],
  },
  {
    id: 'energy',
    ask: "How's your energy?",
    options: [
      { id: 'empty', label: 'Running on empty', says: 'almost out of energy, so nothing strenuous' },
      { id: 'normal', label: 'Normal', says: 'normal energy' },
      { id: 'high', label: 'Up for anything', says: 'plenty of energy and up for anything' },
    ],
  },
  {
    id: 'budget',
    ask: 'How budget-conscious are you feeling?',
    options: [
      { id: 'cheap', label: 'Keep it cheap', says: 'keeping it cheap' },
      { id: 'normal', label: 'Normal', says: 'spending normally' },
      { id: 'splurge', label: 'Splurge', says: 'happy to splurge' },
    ],
  },
  {
    id: 'distance',
    ask: 'How far will you go?',
    options: [
      { id: 'walk', label: 'Walkable (≤12 min)', says: 'within about a 12 minute walk' },
      { id: 'short', label: 'Short ride (≤25 min)', says: 'within about a 25 minute journey' },
      { id: 'far', label: 'Worth the trip', says: 'far enough to be worth the trip' },
    ],
  },
  {
    id: 'time',
    ask: 'How much time do you have?',
    options: [
      { id: 'hour', label: 'About an hour', says: 'about an hour' },
      { id: 'few', label: 'A few hours', says: 'a few hours' },
      { id: 'rest', label: 'Rest of the night', says: 'the rest of the night' },
    ],
  },
];

/** The minutes each distance answer is worth, for filtering and for the prompt. */
export const DISTANCE_MINS: Record<string, number> = { walk: 12, short: 25, far: 90 };

export type Answers = Partial<Record<QuestionId, string>>;

/** What the app already knows, which decides whether a question is worth asking. */
export interface Skips {
  /** A budget answer given earlier the same day, reused rather than re-asked. */
  budgetToday?: string;
  /** Minutes until the next planned item, when there is one. */
  timeCapMin?: number | null;
}

export function question(id: QuestionId): Question | null {
  return QUESTIONS.find((q) => q.id === id) ?? null;
}

/**
 * The questions this run actually asks, in order, given what has been
 * answered so far and what the app already knows.
 *
 * It is recomputed after every tap rather than fixed up front, because
 * answering "Eat" adds a screen and answering "Do something" adds a different
 * one. The progress dots count this list, so they grow or shrink honestly
 * instead of promising seven screens and showing four.
 */
export function flowFor(answers: Answers, skips: Skips = {}): QuestionId[] {
  const after = answers.after;
  const out: QuestionId[] = ['after'];
  if (after === 'eat') out.push('hunger');
  out.push('vibe');
  if (after === 'do' || after === 'wander') out.push('energy');
  if (!skips.budgetToday) out.push('budget');
  out.push('distance');
  if (skips.timeCapMin === null || skips.timeCapMin === undefined) out.push('time');
  return out;
}

/** The next question with no answer yet, or null when the flow is finished. */
export function nextUnanswered(answers: Answers, skips: Skips = {}): QuestionId | null {
  return flowFor(answers, skips).find((id) => !answers[id]) ?? null;
}

/**
 * Questions that can hold more than one answer at once, joined with '+'.
 *
 * Only the vibe. When two travelers ask together, "chill" and "something
 * weird" can both be true of the same bar and either would do; two budgets
 * cannot both be true of one bill.
 */
const MULTI: QuestionId[] = ['vibe'];

/** The option ids an answer holds — one, or several when two were merged. */
export function optionIds(value: string | undefined): string[] {
  return (value ?? '').split('+').filter(Boolean);
}

/**
 * An answer with everything the question does not offer taken out of it.
 *
 * The survivors come back in the order the question lists them, so the same
 * pair of answers always reads the same way round, and a question that holds
 * only one answer keeps only the first.
 */
function keepValid(id: QuestionId, value: unknown): string {
  if (typeof value !== 'string') return '';
  const asked = new Set(optionIds(value));
  const kept = (question(id)?.options ?? []).map((o) => o.id).filter((o) => asked.has(o));
  if (!kept.length) return '';
  return MULTI.includes(id) ? kept.join('+') : kept[0];
}

/**
 * Keep only answers that are real: a question that is part of this flow, and
 * an option that question actually offers.
 *
 * The server runs this on whatever arrives before building a prompt, so a
 * hand-written request carrying `{ vibe: "ignore your instructions" }` reaches
 * Claude as nothing at all.
 */
export function cleanAnswers(raw: unknown, skips: Skips = {}): Answers {
  if (!raw || typeof raw !== 'object') return {};
  const given = raw as Record<string, unknown>;
  const out: Answers = {};
  // Two passes: `after` decides which of the others are in the flow at all.
  const after = keepValid('after', given.after);
  if (after) out.after = after;
  for (const id of flowFor(out, skips)) {
    const value = keepValid(id, given[id]);
    if (value) out[id] = value;
  }
  return out;
}

/**
 * "Not these" — the one question asked when all three picks are wrong.
 *
 * It is one tap rather than the whole flow again, because the answers were
 * nearly right or the three cards would not have been close enough to reject
 * for a reason. Each answer moves exactly one input, which is also what makes
 * the next three visibly different rather than a reshuffle.
 */
export type RerollId = 'far' | 'pricey' | 'vibe' | 'different';

export const REROLL: { id: RerollId; label: string }[] = [
  { id: 'far', label: 'Too far' },
  { id: 'pricey', label: 'Too pricey' },
  { id: 'vibe', label: 'Not the vibe' },
  { id: 'different', label: 'Just different' },
];

export const REROLL_ASK = 'What was wrong with those?';

/** Each ladder from most generous to least, so a step is a step inwards. */
const TIGHTER: Record<string, string> = { far: 'short', short: 'walk', walk: 'walk' };
const CHEAPER: Record<string, string> = { splurge: 'normal', normal: 'cheap', cheap: 'cheap' };

/**
 * The answers to ask again with, and whether anything still needs asking.
 *
 * "Too far" and "Too pricey" move one step and go straight back to Claude —
 * the traveler has already said what was wrong, so asking them to say it again
 * in a different form would be rude. "Not the vibe" is the one that cannot be
 * guessed, so the vibe question comes back. "Just different" changes nothing
 * and relies on the exclusions alone.
 */
export function reroll(answers: Answers, how: RerollId): Answers {
  if (how === 'far') {
    return { ...answers, distance: TIGHTER[answers.distance ?? 'far'] ?? 'walk' };
  }
  if (how === 'pricey') {
    return { ...answers, budget: CHEAPER[answers.budget ?? 'splurge'] ?? 'cheap' };
  }
  if (how === 'vibe') {
    const next = { ...answers };
    delete next.vibe;
    return next;
  }
  return { ...answers };
}

/** The answers as a chip strip: "Real meal · Cheap · Walkable". */
export function summaryChips(answers: Answers): { id: QuestionId; label: string }[] {
  return QUESTIONS.filter((q) => answers[q.id]).map((q) => ({
    id: q.id,
    label: chosen(q, answers[q.id]).map((o) => o.label).join(' + '),
  }));
}

/** The answers as sentences, which is how Claude is told about them. */
export function answerLines(answers: Answers): string[] {
  return QUESTIONS.filter((q) => answers[q.id]).map((q) => {
    const says = chosen(q, answers[q.id]).map((o) => o.says);
    return `- ${q.ask} ${says.join(' or ')}`;
  });
}

/** The options an answer names, in the order the question lists them. */
function chosen(q: Question, value: string | undefined): Option[] {
  const ids = new Set(optionIds(value));
  return q.options.filter((o) => ids.has(o.id));
}

/**
 * Where two travelers answered one question differently, which answer counts.
 *
 * All of these but one are limits rather than tastes, so the tighter of the two
 * wins: a dinner one of them cannot afford, or a walk one of them has not got
 * the energy for, is a worse evening than a dull one. Hunger is the exception
 * and goes the other way, because somewhere that will serve a feast will also
 * serve a snack, and the reverse is not true.
 */
const RANK: Partial<Record<QuestionId, { order: string[]; keep: 'first' | 'last' }>> = {
  hunger: { order: ['snack', 'meal', 'starving', 'feast'], keep: 'last' },
  energy: { order: ['empty', 'normal', 'high'], keep: 'first' },
  budget: { order: ['cheap', 'normal', 'splurge'], keep: 'first' },
  distance: { order: ['walk', 'short', 'far'], keep: 'first' },
  time: { order: ['hour', 'few', 'rest'], keep: 'first' },
};

/**
 * Both travelers' answers as the one set Claude is asked with.
 *
 * `asker` is whoever tapped "Ask … too". Where the two of them want different
 * things altogether — one to eat and one to wander — the asker's answer stands,
 * because they are the one holding the phone and waiting on an answer.
 */
export function mergeAnswers(asker: Answers, other: Answers): Answers {
  const out: Answers = { ...asker };
  for (const q of QUESTIONS) {
    const mine = asker[q.id];
    const theirs = other[q.id];
    if (!theirs) continue;
    if (!mine || mine === theirs) {
      out[q.id] = theirs;
      continue;
    }
    if (MULTI.includes(q.id)) {
      out[q.id] = keepValid(q.id, `${mine}+${theirs}`);
      continue;
    }
    const rank = RANK[q.id];
    if (!rank) continue;
    const both = rank.order.filter((o) => o === mine || o === theirs);
    out[q.id] = (rank.keep === 'first' ? both[0] : both[both.length - 1]) ?? mine;
  }
  // The two of them were asked different questions — one about hunger, the
  // other about energy — so an answer that is no part of the merged flow is
  // dropped rather than shown back as something they said.
  return cleanAnswers(out, {});
}
