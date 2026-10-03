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
  const after = given.after;
  if (typeof after === 'string' && QUESTIONS[0].options.some((o) => o.id === after)) {
    out.after = after;
  }
  for (const id of flowFor(out, skips)) {
    const value = given[id];
    if (typeof value !== 'string') continue;
    if (question(id)?.options.some((o) => o.id === value)) out[id] = value;
  }
  return out;
}

/** The answers as a chip strip: "Real meal · Cheap · Walkable". */
export function summaryChips(answers: Answers): { id: QuestionId; label: string }[] {
  return QUESTIONS.filter((q) => answers[q.id]).map((q) => ({
    id: q.id,
    label: q.options.find((o) => o.id === answers[q.id])?.label ?? '',
  }));
}

/** The answers as sentences, which is how Claude is told about them. */
export function answerLines(answers: Answers): string[] {
  return QUESTIONS.filter((q) => answers[q.id]).map((q) => {
    const option = q.options.find((o) => o.id === answers[q.id]);
    return `- ${q.ask} ${option?.says ?? ''}`;
  });
}
