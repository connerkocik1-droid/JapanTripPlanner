'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAYS, FOODS, HOTELS, LatLng, PLACE, TRANSIT } from './data';
import { PersonId, isPersonId } from './people';

export interface HotelCfg {
  name: string;
  url: string;
  addr: string;
  cost: number;
  ll: LatLng | null;
}

export interface CityCfg {
  nights: number;
  hotelSel: number;
  hotels: HotelCfg[];
  trainName: string;
  trainUrl: string;
  trainCost: number;
  foodPer: number;
}

/** Everything the traveler types or picks. This is what gets persisted. */
export interface TripDoc {
  cfg: Record<string, Partial<CityCfg>>;
  /** Coordinates for cities typed in by hand, resolved by the geocoder. */
  coords: Record<string, LatLng>;
  /** Who last changed each field, keyed by field path (e.g. "Kyoto/foodPer"). */
  touches: Record<string, Touch>;
  /** Thoughts parked for later — things not yet in the plan. */
  comments: Comment[];
  order: string[] | null;
  done: Record<string, boolean>;
  checked: Record<string, boolean>;
}

export interface Touch {
  by: PersonId;
  at: number;
}

export interface Comment {
  id: string;
  by: PersonId;
  at: number;
  /** The city it is about, or null for the trip as a whole. */
  city: string | null;
  text: string;
  resolved: boolean;
}

const STORAGE_KEY = 'trip-planner:v1';
const USER_KEY = 'trip-planner:user';
const EMPTY: TripDoc = { cfg: {}, coords: {}, touches: {}, comments: [], order: null, done: {}, checked: {} };

export function seedOrder(): string[] {
  const o: string[] = [];
  DAYS.forEach((d) => {
    if (o.indexOf(d.city) < 0) o.push(d.city);
  });
  return o;
}

export function defaultNights(city: string): number {
  const n = DAYS.filter((d) => d.city === city).length;
  return n || 2;
}

/** A city's config, with seed values filling anything the user has not set. */
export function cfgFor(doc: TripDoc, city: string): CityCfg {
  const preset = HOTELS[city] || [];
  const t = TRANSIT[city]?.opts[0] ?? { name: '', per: 0 };
  const hotels: HotelCfg[] = [0, 1, 2].map((i) =>
    preset[i]
      ? { name: preset[i].name, url: '', addr: preset[i].note, cost: preset[i].per, ll: preset[i].ll }
      : { name: '', url: '', addr: '', cost: 0, ll: PLACE[city] ?? null },
  );
  return {
    nights: defaultNights(city),
    hotelSel: 0,
    hotels,
    trainName: t.name,
    trainUrl: '',
    trainCost: t.per,
    foodPer: FOODS[1].per,
    ...(doc.cfg[city] ?? {}),
  };
}

function read(): TripDoc {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<TripDoc>;
    return {
      cfg: parsed.cfg ?? {},
      coords: parsed.coords ?? {},
      touches: parsed.touches ?? {},
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      order: Array.isArray(parsed.order) ? parsed.order : null,
      done: parsed.done ?? {},
      checked: parsed.checked ?? {},
    };
  } catch {
    return EMPTY;
  }
}

export interface TripStore {
  doc: TripDoc;
  /** Hydrated from storage — false during the first (server-matching) render. */
  ready: boolean;
  /** Signed-in person, or null while the login screen is up. */
  user: PersonId | null;
  signIn: (id: PersonId) => void;
  signOut: () => void;
  order: string[];
  cfg: (city: string) => CityCfg;
  touch: (path: string) => Touch | undefined;
  setCfg: <K extends keyof CityCfg>(city: string, key: K, val: CityCfg[K]) => void;
  setHotel: <K extends keyof HotelCfg>(city: string, i: number, key: K, val: HotelCfg[K]) => void;
  setOrder: (next: string[]) => void;
  setCoords: (city: string, ll: LatLng) => void;
  toggleDone: (key: string) => void;
  toggleChecked: (key: string) => void;
  addComment: (text: string, city: string | null) => void;
  toggleComment: (id: string) => void;
  removeComment: (id: string) => void;
  reset: () => void;
}

export function useTripStore(): TripStore {
  const [doc, setDoc] = useState<TripDoc>(EMPTY);
  const [user, setUser] = useState<PersonId | null>(null);
  const [ready, setReady] = useState(false);

  // Read after mount so the server and first client render agree.
  useEffect(() => {
    setDoc(read());
    try {
      const saved = window.localStorage.getItem(USER_KEY);
      if (isPersonId(saved)) setUser(saved);
    } catch {
      /* storage blocked — the login screen just shows every time */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      /* private mode or quota — the session still works, it just won't persist */
    }
  }, [doc, ready]);

  const signIn = useCallback((id: PersonId) => {
    setUser(id);
    try {
      window.localStorage.setItem(USER_KEY, id);
    } catch {
      /* not fatal */
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try {
      window.localStorage.removeItem(USER_KEY);
    } catch {
      /* not fatal */
    }
  }, []);

  const userRef = useRef<PersonId | null>(user);
  userRef.current = user;

  /** Stamp a field path with whoever is signed in right now. */
  const stamp = useCallback((d: TripDoc, path: string): TripDoc => {
    const by = userRef.current;
    if (!by) return d;
    return { ...d, touches: { ...d.touches, [path]: { by, at: Date.now() } } };
  }, []);

  const order = useMemo(() => doc.order ?? seedOrder(), [doc.order]);

  const cfg = useCallback((city: string) => cfgFor(doc, city), [doc]);

  const touch = useCallback((path: string) => doc.touches[path], [doc.touches]);

  const setCfg = useCallback(
    <K extends keyof CityCfg>(city: string, key: K, val: CityCfg[K]) => {
      setDoc((d) =>
        stamp({ ...d, cfg: { ...d.cfg, [city]: { ...cfgFor(d, city), [key]: val } } }, `${city}/${String(key)}`),
      );
    },
    [stamp],
  );

  const setHotel = useCallback(
    <K extends keyof HotelCfg>(city: string, i: number, key: K, val: HotelCfg[K]) => {
      setDoc((d) => {
        const cur = cfgFor(d, city);
        const hotels = cur.hotels.map((h, j) => (j === i ? { ...h, [key]: val } : h));
        return stamp({ ...d, cfg: { ...d.cfg, [city]: { ...cur, hotels } } }, `${city}/hotel/${i}`);
      });
    },
    [stamp],
  );

  const setOrder = useCallback(
    (next: string[]) => {
      setDoc((d) => stamp({ ...d, order: next }, 'order'));
    },
    [stamp],
  );

  // Geocoding is the app's own work, not a person's edit — no stamp.
  const setCoords = useCallback((city: string, ll: LatLng) => {
    setDoc((d) => ({ ...d, coords: { ...d.coords, [city]: ll } }));
  }, []);

  const toggleDone = useCallback(
    (key: string) => {
      setDoc((d) => stamp({ ...d, done: { ...d.done, [key]: !d.done[key] } }, `day/${key}`));
    },
    [stamp],
  );

  const toggleChecked = useCallback(
    (key: string) => {
      setDoc((d) => stamp({ ...d, checked: { ...d.checked, [key]: !d.checked[key] } }, `check/${key}`));
    },
    [stamp],
  );

  const addComment = useCallback((text: string, city: string | null) => {
    const body = text.trim();
    const by = userRef.current;
    if (!body || !by) return;
    setDoc((d) => ({
      ...d,
      comments: [
        {
          id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
          by,
          at: Date.now(),
          city,
          text: body,
          resolved: false,
        },
        ...d.comments,
      ],
    }));
  }, []);

  const toggleComment = useCallback((id: string) => {
    setDoc((d) => ({
      ...d,
      comments: d.comments.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)),
    }));
  }, []);

  const removeComment = useCallback((id: string) => {
    setDoc((d) => ({ ...d, comments: d.comments.filter((c) => c.id !== id) }));
  }, []);

  const reset = useCallback(() => setDoc(EMPTY), []);

  return {
    doc, ready, user, signIn, signOut, order, cfg, touch,
    setCfg, setHotel, setOrder, setCoords,
    toggleDone, toggleChecked, addComment, toggleComment, removeComment, reset,
  };
}
