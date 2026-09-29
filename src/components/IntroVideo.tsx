'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The title card that plays over the app each time it is opened, in the
 * browser and installed to the home screen alike.
 *
 * An iPhone in Low Power Mode refuses to start a video on its own, and a web
 * page cannot talk it out of it — which is what kept this blank for Conner.
 * Animated images are not blocked, though, so a refused film falls back to an
 * animated copy of itself rather than being skipped. The still frame sits
 * behind both as the curtain's own background, so the card is on screen from
 * the first moment whichever path is taken, and Skip is always there.
 *
 * The files carry a number in their names. They are served cache first, so a
 * phone that has taken a copy keeps it for good: a re-cut film has to arrive
 * at a URL that device has never seen, or it is never seen either. Bump the
 * number rather than replacing a file in place.
 */

/** The flat colour the film opens on, so its edges are invisible above and
 *  below the picture. */
const FILM_BG = '#f3e9d7';

const FILM = '/intro/trip-intro.4.mp4';
const STILL = '/intro/trip-intro.4.jpg';
/** The same film as an animated image, for a phone that will not play video. */
const ANIMATED = '/intro/trip-intro.4.webp';

/** How long the film runs. The animated copy announces no ending of its own. */
const FILM_MS = 13600;

/**
 * How long the film gets to *start*. Only the start is on a clock: once a
 * frame has played it is left alone, however slowly the rest buffers.
 */
const START_GRACE_MS = 8000;

/** The fade, matched to the CSS transition below. */
const FADE_MS = 340;

export default function IntroVideo() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  /** Set once the video has been refused and the animated copy takes over. */
  const [animated, setAnimated] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const dismiss = useCallback(() => setLeaving(true), []);

  // Lift the curtain after the fade, whatever ended it.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    if (gone || animated) return;

    const el = video.current;
    if (!el) {
      setGone(true);
      return;
    }

    // React sets `muted` as a property after mount, which can land after the
    // browser has already decided whether this may autoplay. Saying it again
    // before asking is what keeps a phone from refusing on that alone.
    el.muted = true;
    el.defaultMuted = true;

    const grace = setTimeout(() => {
      if (el.readyState < 3) setAnimated(true);
    }, START_GRACE_MS);

    const playing = () => clearTimeout(grace);
    el.addEventListener('playing', playing);

    // Refused, unsupported, or a file this phone will not decode: here they
    // all mean the same thing, which is that the animation takes over.
    el.play().catch(() => setAnimated(true));

    return () => {
      clearTimeout(grace);
      el.removeEventListener('playing', playing);
    };
  }, [gone, animated]);

  // The animated copy reports nothing, so it is given the film's own length.
  useEffect(() => {
    if (!animated || gone) return;
    const t = setTimeout(dismiss, FILM_MS);
    return () => clearTimeout(t);
  }, [animated, gone, dismiss]);

  if (gone) return null;

  return (
    <div
      onPointerDown={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: FILM_BG,
        // The card is on screen while whatever will play it is still loading.
        backgroundImage: `url(${STILL})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        // Once it is on its way out the planner underneath takes the taps.
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      {animated ? (
        <img src={ANIMATED} alt="" className="intro-film" onError={dismiss} />
      ) : (
        <video
          ref={video}
          src={FILM}
          poster={STILL}
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={dismiss}
          onError={() => setAnimated(true)}
          aria-hidden
          className="intro-film"
        />
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
