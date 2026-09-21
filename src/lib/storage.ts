'use client';

/**
 * Where the plan is kept.
 *
 * IndexedDB is the store of record: unlike localStorage it is asynchronous,
 * has real quota, and is what browsers keep when a site is installed. A copy
 * also goes to localStorage as a cheap belt-and-braces backup, and as the
 * migration path from the first version of the app.
 *
 * Nothing here throws. A browser with storage blocked still runs the app for
 * the session; the UI reports the save state rather than pretending.
 */

const DB_NAME = 'trip-planner';
const STORE = 'docs';
const DOC_KEY = 'trip';
const MIRROR_KEY = 'trip-planner:v2';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function idbGet<T>(): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(DOC_KEY);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, DOC_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function mirrorRead<T>(): T | null {
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function mirrorWrite(value: unknown): void {
  try {
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(value));
  } catch {
    /* quota or private mode — IndexedDB is the store of record anyway */
  }
}

/** Read the saved plan, preferring IndexedDB and falling back to the mirror. */
export async function loadDoc<T>(): Promise<T | null> {
  const fromIdb = await idbGet<T>();
  if (fromIdb) return fromIdb;
  const fromMirror = mirrorRead<T>();
  if (fromMirror) {
    // First run after the upgrade: move the old copy into IndexedDB.
    void idbPut(fromMirror);
    return fromMirror;
  }
  return null;
}

export async function saveDoc(value: unknown): Promise<boolean> {
  mirrorWrite(value);
  return idbPut(value);
}

/**
 * Ask the browser not to evict this origin. Chrome grants it to installed
 * apps; Safari uses it to exempt the site from its 7-day cleanup of unused
 * storage, which matters when the plan only lives on the device.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Hand the plan to the traveler as a file — the backup that outlives a device. */
export function downloadDoc(value: unknown, name: string): void {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (name || 'trip').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        resolve(JSON.parse(String(r.result)));
      } catch {
        reject(new Error('That file is not a saved plan.'));
      }
    };
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsText(file);
  });
}
