'use client';

/**
 * The one line under the top few places in a day's list.
 *
 * Everything else about that list is arithmetic. This is the only part of it
 * that asks Claude anything, so it is deliberately the smallest ask in the
 * app: at most three places, one short line each, and the answer is kept on
 * the device against the day, the mood and those exact three places. Scrolling
 * the list again, or coming back to the day, costs nothing.
 *
 * It only ever asks once somebody has set a mood. A line that appears because
 * you opened a day is a line nobody asked for, and it would spend money on
 * every day you glanced at.
 */

import { useEffect, useState } from 'react';
import { aiConfigured, postLines } from './aiStream.ts';
import type { Answers } from '../../supabase/functions/draft-day/questions.ts';

/** How long the chips have to sit still before it is worth asking. */
const SETTLE_MS = 1200;

const KEY = 'trip-planner:why:';

/** At most this many, matching what the function will answer about. */
export const TOP = 3;

/** What an answer belongs to: this day, this mood, these three places. */
export function whySig(dayKey: string, lens: Answers, ids: string[]): string {
  const mood = Object.keys(lens)
    .sort()
    .map((k) => `${k}=${lens[k as keyof Answers]}`)
    .join(',');
  return [dayKey, mood, ids.slice(0, TOP).join(',')].join('|');
}

export function readWhy(sig: string): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(KEY + sig);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

function writeWhy(sig: string, lines: Record<string, string>): void {
  try {
    window.localStorage.setItem(KEY + sig, JSON.stringify(lines));
  } catch {
    /* private mode, or a full store — it simply asks again next time */
  }
}

/**
 * The lines for the places at the top of the list, keyed by place id.
 *
 * Empty until there is something to show, which is the point: the list is
 * complete without it and gains a line when one arrives, rather than holding
 * a space open for one.
 */
export function useWhy(
  code: string | null,
  dayKey: string,
  lens: Answers,
  ids: string[],
): Record<string, string> {
  const top = ids.slice(0, TOP);
  const sig = whySig(dayKey, lens, top);
  const [lines, setLines] = useState<Record<string, string>>({});

  useEffect(() => {
    setLines({});
    if (!code || !aiConfigured() || !top.length || !Object.keys(lens).length) return;

    const cached = readWhy(sig);
    if (cached) {
      setLines(cached);
      return;
    }

    const ctrl = new AbortController();
    // Changing a chip re-orders the list at once; asking about every order it
    // passes through on the way would be three calls for one decision.
    const wait = setTimeout(() => {
      const got: Record<string, string> = {};
      void postLines(
        { action: 'why', code, dayKey, answers: lens, ids: top },
        (raw) => {
          if (raw.type === 'done') return false;
          if (raw.type !== 'why') return true;
          const line = raw.line as { placeId?: unknown; why?: unknown } | null;
          if (!line || typeof line.placeId !== 'string' || typeof line.why !== 'string') return true;
          got[line.placeId] = line.why;
          setLines({ ...got });
          return true;
        },
        ctrl.signal,
      ).then(() => {
        // Only a complete answer is worth keeping: a half-written one would be
        // served from the cache for good.
        if (!ctrl.signal.aborted && Object.keys(got).length === top.length) writeWhy(sig, got);
      });
    }, SETTLE_MS);

    return () => {
      clearTimeout(wait);
      ctrl.abort();
    };
    // The signature is the whole of what this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, code]);

  return lines;
}
