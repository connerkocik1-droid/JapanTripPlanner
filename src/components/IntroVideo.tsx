'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The title card that plays over the app each time it is opened, in the
 * browser and installed to the home screen alike.
 *
 * It is a curtain, never a gate: the planner renders and boots underneath it
 * from the first frame, so a video that is slow, blocked or missing costs
 * nothing but the moment it takes to notice. Muted and inline so iOS lets it
 * start on its own, and a tap anywhere gets past it.
 */

/** The flat colour the film opens on, so its edges are invisible on a wide
 *  window, where the whole 9:16 frame is shown rather than filling the screen. */
const FILM_BG = '#f3e9d7';

/** How long a silent video gets to start before the curtain lifts anyway. */
const START_GRACE_MS = 2500;

/** The fade, matched to the CSS transition below. */
const FADE_MS = 340;

export default function IntroVideo() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const dismiss = useCallback(() => setLeaving(true), []);

  // Lift the curtain after the fade, whatever ended it.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    if (gone) return;

    // Someone who has asked for less motion gets the app, not the film.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setGone(true);
      return;
    }

    const el = video.current;
    if (!el) {
      setGone(true);
      return;
    }

    // Autoplay is refused often enough — on a first visit in some browsers, or
    // under a data saver — that the promise is worth catching rather than
    // leaving the curtain down over a frozen first frame.
    el.play().catch(dismiss);

    // Nothing about the film is load-bearing, so a video that has not started
    // by now is simply given up on.
    const grace = setTimeout(() => {
      if (el.currentTime === 0 || el.paused) dismiss();
    }, START_GRACE_MS);
    return () => clearTimeout(grace);
  }, [gone, dismiss]);

  if (gone) return null;

  return (
    <div
      onPointerDown={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: FILM_BG,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        // Once it is on its way out the planner underneath takes the taps.
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      <video
        ref={video}
        src="/intro/trip-intro.mp4"
        poster="/intro/trip-intro.jpg"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={dismiss}
        onError={dismiss}
        aria-hidden
        className="intro-film"
      />
      <button
        className="tap mono"
        onClick={dismiss}
        style={{
          position: 'absolute', right: 'max(16px, env(safe-area-inset-right))',
          bottom: 'calc(22px + env(safe-area-inset-bottom))',
          padding: '8px 16px', borderRadius: 9999,
          border: '1px solid rgba(60, 42, 28, 0.18)',
          background: 'rgba(255, 253, 248, 0.82)',
          color: 'var(--color-neutral-500)', fontSize: 10.5, cursor: 'pointer',
        }}
      >
        Skip
      </button>
    </div>
  );
}
