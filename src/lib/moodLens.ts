'use client';

/**
 * The mood a day's place list is being read through.
 *
 * It is the same handful of answers "Help me decide" asks for, kept per day
 * on the device. Per day because it is a mood, not a setting: what you felt
 * like on Tuesday night in Seoul has nothing to say about Friday lunchtime in
 * Kyoto. On the device rather than in the trip because it is one person's
 * mood in a given hour, and syncing it would mean re-sorting somebody else's
 * list under them.
 */

import { cleanAnswers, type Answers } from '../../supabase/functions/draft-day/questions.ts';

const KEY = 'trip-planner:mood:';

/** What was stored, with anything that is not a real answer thrown away. */
export function readLens(dayKey: string): Answers {
  try {
    const raw = window.localStorage.getItem(KEY + dayKey);
    return raw ? cleanAnswers(JSON.parse(raw), {}) : {};
  } catch {
    return {};
  }
}

export function writeLens(dayKey: string, answers: Answers): void {
  try {
    if (!Object.keys(answers).length) window.localStorage.removeItem(KEY + dayKey);
    else window.localStorage.setItem(KEY + dayKey, JSON.stringify(answers));
  } catch {
    /* private mode — the mood simply does not outlive the screen */
  }
}
