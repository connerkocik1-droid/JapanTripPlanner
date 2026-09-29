'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The title card that plays over the app each time it is opened, in the
 * browser and installed to the home screen alike.
 *
 * It used to clear itself the moment anything went wrong, which meant three
 * rounds of "it isn't playing" with nothing to go on: a blocked video, an
 * undecodable one and a stale cached one all looked identical from the outside.
 * So nothing here fails quietly any more. If the film cannot start, the still
 * frame stays up with a tap to play it and a line saying what the browser
 * said — and Skip is always there, so a curtain that will not lift is never
 * more than one tap from the planner underneath.
 *
 * The files carry a number in their names. They are served cache first, so a
 * phone that has taken a copy keeps it for good: a re-cut film has to arrive
 * at a URL that device has never seen, or it is never seen either. Bump the
 * number rather than replacing a file in place.
 */

/** The flat colour the film opens on, so its edges are invisible above and
 *  below the picture. */
const FILM_BG = '#f3e9d7';

/**
 * How long the film gets to *start*. Only the start is on a clock: once a
 * frame has played it is left alone, however slowly the rest buffers.
 */
const START_GRACE_MS = 8000;

/** The fade, matched to the CSS transition below. */
const FADE_MS = 340;

/** What the browser said when the film would not start, in its own words. */
type Trouble = { what: string; detail: string };

export default function IntroVideo() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const video = useRef<HTMLVideoElement>(null);

  const dismiss = useCallback(() => setLeaving(true), []);

  // Lift the curtain after the fade, whatever ended it.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  /** Ask the film to play, and remember the refusal if there is one. */
  const start = useCallback(() => {
    const el = video.current;
    if (!el) return;
    el.muted = true;
    el.play().then(
      () => setTrouble(null),
      (err: DOMException) =>
        // The two refusals mean opposite things and are worth telling apart on
        // sight: the phone would not start it, or it cannot play this file.
        setTrouble({
          what: err.name === 'NotAllowedError' ? 'blocked' : 'unsupported',
          detail: err.name,
        }),
    );
  }, []);

  useEffect(() => {
    if (gone) return;

    const el = video.current;
    if (!el) {
      setGone(true);
      return;
    }

    // React sets `muted` as a property after mount, which can land after the
    // browser has already decided whether this may autoplay. Saying it again
    // before asking is what keeps iOS from refusing on that alone.
    el.defaultMuted = true;

    const grace = setTimeout(() => {
      if (el.readyState < 3) setTrouble({ what: 'stalled', detail: `ready ${el.readyState}` });
    }, START_GRACE_MS);

    const playing = () => {
      clearTimeout(grace);
      setTrouble(null);
    };
    el.addEventListener('playing', playing);

    start();

    return () => {
      clearTimeout(grace);
      el.removeEventListener('playing', playing);
    };
  }, [gone, start]);

  if (gone) return null;

  const stuck = trouble !== null;

  return (
    <div
      // While the film runs, a tap anywhere gets past it. While it is stuck,
      // taps belong to the buttons below instead.
      onPointerDown={stuck ? undefined : dismiss}
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
        src="/intro/trip-intro.3.mp4"
        poster="/intro/trip-intro.3.jpg"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={dismiss}
        onError={() => {
          const e = video.current?.error;
          setTrouble({ what: 'error', detail: `${e?.code ?? '?'} ${e?.message ?? ''}`.trim() });
        }}
        aria-hidden
        className="intro-film"
      />

      {stuck && (
        <div
          style={{
            position: 'absolute', left: 0, right: 0,
            bottom: 'calc(64px + env(safe-area-inset-bottom))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            padding: '0 24px', textAlign: 'center',
          }}
        >
          <button
            className="tap"
            onClick={start}
            style={{
              padding: '12px 26px', borderRadius: 9999,
              border: '1px solid rgba(60, 42, 28, 0.2)',
              background: 'rgba(255, 253, 248, 0.92)', cursor: 'pointer',
              fontSize: 15, fontWeight: 600, color: 'var(--color-text)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            Tap to play the intro
          </button>
          <div className="mono" style={{ fontSize: 9, color: 'var(--color-neutral-600)' }}>
            {trouble.what} · {trouble.detail}
          </div>
        </div>
      )}

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
