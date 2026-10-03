'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The title card that plays over the app the first time it is opened, in the
 * browser and installed to the home screen alike. Once it has been watched or
 * skipped the flag below is kept, and every later open goes straight into the
 * planner: no film, no animation, no pause, and none of the files fetched.
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

/**
 * Where "they have seen it" is kept. The same key is read by the little script
 * in the page's head, which hides the curtain before the browser has painted
 * anything — this component cannot do that itself, because the markup is sent
 * from the server and shown before any of this code runs.
 */
export const INTRO_SEEN_KEY = 'introSeen';

/** How long the film runs. The animated copy announces no ending of its own. */
const FILM_MS = 13600;

/**
 * How long the film gets to *start*. Only the start is on a clock: once a
 * frame has played it is left alone, however slowly the rest buffers.
 */
const START_GRACE_MS = 8000;

/** The fade, matched to the CSS transition below. */
const FADE_MS = 340;

/** Private browsing and a locked-down browser both throw here rather than
 *  returning nothing, so every touch of the store is wrapped. */
function introSeen(): boolean {
  try {
    return window.localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberIntroSeen() {
  try {
    window.localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Nothing to be done; they get the intro again next time.
  }
}

export default function IntroVideo() {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  /**
   * Set once we know this is a first visit. The film and the animation hang off
   * it, so a returning visitor never has either in the page and the browser is
   * never asked for the files.
   */
  const [armed, setArmed] = useState(false);
  /** Set once the video has been refused and the animated copy takes over. */
  const [animated, setAnimated] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  const dismiss = useCallback(() => {
    rememberIntroSeen();
    setLeaving(true);
  }, []);

  // First thing on the client: have they already seen it? The curtain is in the
  // markup either way, so a returning visitor's copy is dropped here, and the
  // head script has already kept it from being painted.
  useEffect(() => {
    if (introSeen()) setGone(true);
    else setArmed(true);
  }, []);

  // Lift the curtain after the fade, whatever ended it.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

  useEffect(() => {
    if (!armed || gone || animated) return;

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
  }, [armed, gone, animated]);

  // The animated copy reports nothing, so it is given the film's own length.
  useEffect(() => {
    if (!animated || gone) return;
    const t = setTimeout(dismiss, FILM_MS);
    return () => clearTimeout(t);
  }, [animated, gone, dismiss]);

  if (gone) return null;

  return (
    <div
      className="intro-curtain"
      onPointerDown={dismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: FILM_BG,
        // The card is on screen while whatever will play it is still loading.
        // A returning visitor's curtain is hidden before paint, and a hidden
        // element's background is never fetched.
        backgroundImage: armed ? `url(${STILL})` : undefined,
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
      {armed && (animated ? (
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
      ))}
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
