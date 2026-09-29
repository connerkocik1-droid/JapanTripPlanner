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
 *
 * The files carry a number in their names. They are served cache first, so a
 * phone that has taken a copy keeps it for good: a re-cut film has to arrive
 * at a URL that device has never seen, or it is never seen either. Bump the
 * number rather than replacing a file in place.
 */

/** The flat colour the film opens on, so its edges are invisible on a wide
 *  window, where the whole frame is shown rather than filling the screen. */
const FILM_BG = '#f3e9d7';

/**
 * How long the film gets to *start*. Only the start is on a clock: once a
 * frame has played the curtain waits for the film however slowly it buffers,
 * because cutting a film off mid-sentence is worse than a pause. Generous,
 * since a phone on a bad signal is the case this is for.
 */
const START_GRACE_MS = 8000;

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

    const el = video.current;
    if (!el) {
      setGone(true);
      return;
    }

    // React sets `muted` as a property after mount, which can land after the
    // browser has already decided whether this is allowed to autoplay. Saying
    // it again here, before asking, is what keeps iOS from refusing.
    el.muted = true;
    el.defaultMuted = true;

    let grace: ReturnType<typeof setTimeout> | undefined;

    // A frame has played: the film is running and owns the screen until it ends.
    const started = () => clearTimeout(grace);
    el.addEventListener('playing', started);

    // A refusal is worth one more ask once there is something to play — the
    // first attempt can land before the browser has data and be turned down
    // for that alone.
    const retry = () => el.play().catch(dismiss);
    el.play().catch(() => el.addEventListener('canplay', retry, { once: true }));

    grace = setTimeout(dismiss, START_GRACE_MS);

    return () => {
      clearTimeout(grace);
      el.removeEventListener('playing', started);
      el.removeEventListener('canplay', retry);
    };
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
        src="/intro/trip-intro.2.mp4"
        poster="/intro/trip-intro.2.jpg"
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
