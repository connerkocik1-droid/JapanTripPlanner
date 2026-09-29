'use client';

/**
 * Where you are standing, asked for rather than watched.
 *
 * The app never asks for your location on its own: nothing in planning a trip
 * needs it, and a permission prompt on first open is the fastest way to get
 * told no. On the day, one button asks, and the answer is kept for as long as
 * the tab is open so the legs it routes do not re-ask.
 */

import { useCallback, useRef, useState } from 'react';
import { LatLng } from './data';

export type HereState = 'idle' | 'looking' | 'ok' | 'denied' | 'failed';

export interface Here {
  ll: LatLng;
  /** Metres, as the device reports it — a city block or a whole district. */
  accuracy: number;
  /** When it was read, for saying how old the fix is. */
  at: number;
}

export function useHere(): {
  here: Here | null;
  state: HereState;
  supported: boolean;
  locate: () => void;
  clear: () => void;
} {
  const [here, setHere] = useState<Here | null>(null);
  const [state, setState] = useState<HereState>('idle');
  const pending = useRef(false);

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const locate = useCallback(() => {
    if (!supported || pending.current) return;
    pending.current = true;
    setState('looking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        pending.current = false;
        setHere({
          ll: [pos.coords.latitude, pos.coords.longitude],
          accuracy: Math.round(pos.coords.accuracy || 0),
          at: Date.now(),
        });
        setState('ok');
      },
      (err) => {
        pending.current = false;
        // Denied is worth saying plainly; a timeout indoors is worth retrying.
        setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'failed');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, [supported]);

  const clear = useCallback(() => {
    setHere(null);
    setState('idle');
  }, []);

  return { here, state, supported, locate, clear };
}
