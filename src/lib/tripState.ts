'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckItem, City, DayItem, Hotel, LatLng, Place, Trip,
  blankCity, blankHotel, newTrip, uid,
} from './data';
import { PersonId, isPersonId } from './people';

export interface Touch {
  by: PersonId;
  at: number;
}

export interface Comment {
  id: string;
  by: PersonId;
  at: number;
  /** City id it is about, or null for the trip as a whole. */
  city: string | null;
  text: string;
  resolved: boolean;
}

/** Everything the travelers author. This is the whole persisted document. */
export interface TripDoc {
  trip: Trip;
  cities: City[];
  /** Itinerary items, keyed `${cityId}:${nightIndex}` so they survive reorder. */
  days: Record<string, DayItem[]>;
  checklist: CheckItem[];
  comments: Comment[];
  /** Who last changed each field, keyed by field path. */
  touches: Record<string, Touch>;
}

const STORAGE_KEY = 'trip-planner:v2';
const USER_KEY = 'trip-planner:user';

export function emptyDoc(): TripDoc {
  return { trip: newTrip(), cities: [], days: {}, checklist: [], comments: [], touches: {} };
}

export function dayKey(cityId: string, n: number): string {
  return `${cityId}:${n}`;
}

function read(): TripDoc {
  const base = emptyDoc();
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<TripDoc>;
    return {
      trip: { ...base.trip, ...(p.trip ?? {}) },
      cities: Array.isArray(p.cities) ? p.cities : [],
      days: p.days ?? {},
      checklist: Array.isArray(p.checklist) ? p.checklist : [],
      comments: Array.isArray(p.comments) ? p.comments : [],
      touches: p.touches ?? {},
    };
  } catch {
    return base;
  }
}

export interface TripStore {
  doc: TripDoc;
  /** Hydrated from storage — false during the first (server-matching) render. */
  ready: boolean;
  user: PersonId | null;
  signIn: (id: PersonId) => void;
  signOut: () => void;
  touch: (path: string) => Touch | undefined;

  setTrip: <K extends keyof Trip>(key: K, val: Trip[K]) => void;

  addCity: (name: string, ll: LatLng | null) => string;
  removeCity: (id: string) => void;
  moveCity: (id: string, dir: number) => void;
  setCity: <K extends keyof City>(id: string, key: K, val: City[K]) => void;

  setHotel: <K extends keyof Hotel>(cityId: string, hotelId: string, key: K, val: Hotel[K]) => void;
  addHotelSlot: (cityId: string) => void;

  addPlace: (cityId: string) => string;
  setPlace: <K extends keyof Place>(cityId: string, placeId: string, key: K, val: Place[K]) => void;
  removePlace: (cityId: string, placeId: string) => void;

  addDayItem: (key: string) => string;
  setDayItem: <K extends keyof DayItem>(key: string, itemId: string, field: K, val: DayItem[K]) => void;
  removeDayItem: (key: string, itemId: string) => void;
  toggleDayItem: (key: string, itemId: string) => void;

  addCheck: (text: string) => void;
  setCheck: (id: string, text: string) => void;
  toggleCheck: (id: string) => void;
  removeCheck: (id: string) => void;

  addComment: (text: string, city: string | null) => void;
  toggleComment: (id: string) => void;
  removeComment: (id: string) => void;

  reset: () => void;
}

export function useTripStore(): TripStore {
  const [doc, setDoc] = useState<TripDoc>(emptyDoc);
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

  /** Apply a change and stamp the field path with whoever is signed in. */
  const edit = useCallback((path: string | null, fn: (d: TripDoc) => TripDoc) => {
    setDoc((d) => {
      const next = fn(d);
      const by = userRef.current;
      if (!path || !by) return next;
      return { ...next, touches: { ...next.touches, [path]: { by, at: Date.now() } } };
    });
  }, []);

  const mapCity = (d: TripDoc, id: string, fn: (c: City) => City): TripDoc => ({
    ...d,
    cities: d.cities.map((c) => (c.id === id ? fn(c) : c)),
  });

  const touch = useCallback((path: string) => doc.touches[path], [doc.touches]);

  const setTrip = useCallback(
    <K extends keyof Trip>(key: K, val: Trip[K]) => {
      edit(`trip/${String(key)}`, (d) => ({ ...d, trip: { ...d.trip, [key]: val } }));
    },
    [edit],
  );

  const addCity = useCallback(
    (name: string, ll: LatLng | null) => {
      const city = blankCity(name.trim(), ll);
      edit(`${city.id}/added`, (d) => ({ ...d, cities: [...d.cities, city] }));
      return city.id;
    },
    [edit],
  );

  const removeCity = useCallback(
    (id: string) => {
      edit(null, (d) => {
        const days = { ...d.days };
        Object.keys(days).forEach((k) => {
          if (k.startsWith(id + ':')) delete days[k];
        });
        return { ...d, cities: d.cities.filter((c) => c.id !== id), days };
      });
    },
    [edit],
  );

  const moveCity = useCallback(
    (id: string, dir: number) => {
      edit('order', (d) => {
        const cities = d.cities.slice();
        const i = cities.findIndex((c) => c.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= cities.length) return d;
        cities.splice(j, 0, cities.splice(i, 1)[0]);
        return { ...d, cities };
      });
    },
    [edit],
  );

  const setCity = useCallback(
    <K extends keyof City>(id: string, key: K, val: City[K]) => {
      edit(`${id}/${String(key)}`, (d) => mapCity(d, id, (c) => ({ ...c, [key]: val })));
    },
    [edit],
  );

  const setHotel = useCallback(
    <K extends keyof Hotel>(cityId: string, hotelId: string, key: K, val: Hotel[K]) => {
      // Geocoding is the app's own work, not a person's edit — leave it unstamped.
      const path = key === 'll' ? null : `${cityId}/hotel/${hotelId}`;
      edit(path, (d) =>
        mapCity(d, cityId, (c) => ({
          ...c,
          hotels: c.hotels.map((h) => (h.id === hotelId ? { ...h, [key]: val } : h)),
        })),
      );
    },
    [edit],
  );

  const addHotelSlot = useCallback(
    (cityId: string) => {
      edit(`${cityId}/hotels`, (d) => mapCity(d, cityId, (c) => ({ ...c, hotels: [...c.hotels, blankHotel()] })));
    },
    [edit],
  );

  const addPlace = useCallback(
    (cityId: string) => {
      const id = uid();
      edit(`${cityId}/places`, (d) =>
        mapCity(d, cityId, (c) => ({
          ...c,
          places: [...c.places, { id, name: '', addr: '', note: '', band: '', ll: null }],
        })),
      );
      return id;
    },
    [edit],
  );

  const setPlace = useCallback(
    <K extends keyof Place>(cityId: string, placeId: string, key: K, val: Place[K]) => {
      const path = key === 'll' ? null : `${cityId}/place/${placeId}`;
      edit(path, (d) =>
        mapCity(d, cityId, (c) => ({
          ...c,
          places: c.places.map((p) => (p.id === placeId ? { ...p, [key]: val } : p)),
        })),
      );
    },
    [edit],
  );

  const removePlace = useCallback(
    (cityId: string, placeId: string) => {
      edit(null, (d) => mapCity(d, cityId, (c) => ({ ...c, places: c.places.filter((p) => p.id !== placeId) })));
    },
    [edit],
  );

  const addDayItem = useCallback(
    (key: string) => {
      const id = uid();
      edit(`day/${key}`, (d) => ({
        ...d,
        days: {
          ...d.days,
          [key]: [...(d.days[key] ?? []), { id, time: '', title: '', note: '', cost: 0, done: false }],
        },
      }));
      return id;
    },
    [edit],
  );

  const setDayItem = useCallback(
    <K extends keyof DayItem>(key: string, itemId: string, field: K, val: DayItem[K]) => {
      edit(`day/${key}`, (d) => ({
        ...d,
        days: {
          ...d.days,
          [key]: (d.days[key] ?? []).map((it) => (it.id === itemId ? { ...it, [field]: val } : it)),
        },
      }));
    },
    [edit],
  );

  const removeDayItem = useCallback(
    (key: string, itemId: string) => {
      edit(null, (d) => ({
        ...d,
        days: { ...d.days, [key]: (d.days[key] ?? []).filter((it) => it.id !== itemId) },
      }));
    },
    [edit],
  );

  const toggleDayItem = useCallback(
    (key: string, itemId: string) => {
      edit(`day/${key}`, (d) => ({
        ...d,
        days: {
          ...d.days,
          [key]: (d.days[key] ?? []).map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
        },
      }));
    },
    [edit],
  );

  const addCheck = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body) return;
      edit('checklist', (d) => ({
        ...d,
        checklist: [...d.checklist, { id: uid(), text: body, done: false }],
      }));
    },
    [edit],
  );

  const setCheck = useCallback(
    (id: string, text: string) => {
      edit('checklist', (d) => ({
        ...d,
        checklist: d.checklist.map((c) => (c.id === id ? { ...c, text } : c)),
      }));
    },
    [edit],
  );

  const toggleCheck = useCallback(
    (id: string) => {
      edit(`check/${id}`, (d) => ({
        ...d,
        checklist: d.checklist.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
      }));
    },
    [edit],
  );

  const removeCheck = useCallback(
    (id: string) => {
      edit(null, (d) => ({ ...d, checklist: d.checklist.filter((c) => c.id !== id) }));
    },
    [edit],
  );

  const addComment = useCallback((text: string, city: string | null) => {
    const body = text.trim();
    const by = userRef.current;
    if (!body || !by) return;
    setDoc((d) => ({
      ...d,
      comments: [
        { id: uid(), by, at: Date.now(), city, text: body, resolved: false },
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

  const reset = useCallback(() => setDoc(emptyDoc()), []);

  return useMemo(
    () => ({
      doc, ready, user, signIn, signOut, touch, setTrip,
      addCity, removeCity, moveCity, setCity,
      setHotel, addHotelSlot,
      addPlace, setPlace, removePlace,
      addDayItem, setDayItem, removeDayItem, toggleDayItem,
      addCheck, setCheck, toggleCheck, removeCheck,
      addComment, toggleComment, removeComment, reset,
    }),
    [
      doc, ready, user, signIn, signOut, touch, setTrip,
      addCity, removeCity, moveCity, setCity, setHotel, addHotelSlot,
      addPlace, setPlace, removePlace, addDayItem, setDayItem, removeDayItem, toggleDayItem,
      addCheck, setCheck, toggleCheck, removeCheck, addComment, toggleComment, removeComment, reset,
    ],
  );
}
