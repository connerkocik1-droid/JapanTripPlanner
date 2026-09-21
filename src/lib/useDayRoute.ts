'use client';

import { useEffect, useState } from 'react';
import { LatLng, TravelMode } from './data';
import { LegOptions, betterMode, routeLeg } from './routing';

export interface Stop {
  /** Day item id. */
  id: string;
  label: string;
  ll: LatLng;
  mode: TravelMode;
}

export interface HopResult {
  /** Day item id of the stop being travelled to. */
  toId: string;
  from: Stop;
  to: Stop;
  options: LegOptions;
  /** What the app would pick, given the two options. */
  suggested: TravelMode | null;
  loading: boolean;
}

/** The leg a hop would be taken by: the chosen mode, else what the app suggests. */
export function legOf(hop: HopResult, mode?: TravelMode) {
  const want = mode ?? hop.suggested ?? 'walk';
  return hop.options[want] ?? hop.options.walk ?? hop.options.transit;
}

/**
 * Routes each consecutive pair of located stops in a day. Nothing is requested
 * for places that are merely pinned — a place is only routed once it is a stop.
 */
export function useDayRoute(stops: Stop[]): HopResult[] {
  const [hops, setHops] = useState<HopResult[]>([]);
  const signature = stops.map((s) => `${s.id}:${s.ll[0].toFixed(5)},${s.ll[1].toFixed(5)}`).join('|');

  useEffect(() => {
    let live = true;
    const pairs = stops.slice(0, -1).map((from, i) => ({ from, to: stops[i + 1] }));

    setHops(
      pairs.map(({ from, to }) => ({
        toId: to.id,
        from,
        to,
        options: {},
        suggested: null,
        loading: true,
      })),
    );
    if (!pairs.length) return;

    (async () => {
      const results = await Promise.all(
        pairs.map(async ({ from, to }) => {
          const options = await routeLeg(from.ll, to.ll, ['walk', 'transit']);
          return {
            toId: to.id,
            from,
            to,
            options,
            suggested: betterMode(options),
            loading: false,
          };
        }),
      );
      if (live) setHops(results);
    })();

    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return hops;
}
