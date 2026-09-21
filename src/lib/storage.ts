'use client';

/**
 * Where the plan is kept.
 *
 * Two stores, and neither one can be trusted alone. IndexedDB has real quota
 * and is what browsers keep when a site is installed, but every write to it is
 * asynchronous, so a write started as the tab goes away can die before it
 * lands. localStorage is small, but it writes synchronously, which is the only
 * kind of write that survives being closed mid-edit.
 *
 * So the plan goes to both, and every record carries the revision it was
 * written at. On load the two are compared and the newer one wins, whichever
 * store it came from; the stale store is then healed from it. Preferring one
 * store outright would throw away the copy that the other one rescued.
 *
 * Nothing here throws. A browser with storage blocked still runs the app for
 * the session; the UI reports the save state rather than pretending.
 */

const DB_NAME = 'trip-planner';
const STORE = 'docs';

/**
 * A device can hold several trips, so each one gets its own slot in both
 * stores. The un-suffixed keys below are what a single-trip device wrote
 * before the picker existed; `migrateLegacyTrip` moves that plan into the slot
 * of the trip it belonged to.
 */
const LEGACY_DOC_KEY = 'trip';
const LEGACY_MIRROR_KEY = 'trip-planner:v2';

const docKey = (code: string) => `trip:${code}`;
const mirrorKey = (code: string) => `trip-planner:v2:${code}`;

/**
 * A saved record. `rev` counts writes within a session and `savedAt` breaks
 * ties between sessions and between tabs, which start their own count.
 */
interface Envelope {
  rev: number;
  savedAt: number;
  doc: unknown;
}

/** The revision this session last wrote, seeded from whatever it loaded. */
let rev = 0;

function isEnvelope(raw: unknown): raw is Envelope {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as Partial<Envelope>;
  return typeof e.rev === 'number' && 'doc' in e;
}

/** Read a record from either store, accepting the bare docs written before this. */
function unwrap(raw: unknown): Envelope | null {
  if (raw === null || raw === undefined) return null;
  if (isEnvelope(raw)) {
    return { rev: raw.rev, savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0, doc: raw.doc };
  }
  // Written before saves were versioned: the record is the document itself,
  // and it is older than anything this version has written.
  return { rev: 0, savedAt: 0, doc: raw };
}

/** Which of two records was written last. */
function newer(a: Envelope | null, b: Envelope | null): Envelope | null {
  if (!a) return b;
  if (!b) return a;
  if (a.rev !== b.rev) return a.rev > b.rev ? a : b;
  return a.savedAt >= b.savedAt ? a : b;
}

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

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function mirrorRead<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function mirrorWrite(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode — IndexedDB is the store of record anyway */
  }
}

/**
 * Read the saved plan: whichever store holds the newer record wins.
 *
 * The mirror is not just a backup. A save that starts as the tab closes only
 * finishes in localStorage, because that write is synchronous, so the mirror is
 * routinely a revision ahead of IndexedDB. Reading IndexedDB first and
 * stopping there would hand back the stale copy and then save it over the
 * rescued one, losing the edit for good.
 */
export async function loadDoc<T>(code: string): Promise<T | null> {
  const fromIdb = unwrap(await idbGet<unknown>(docKey(code)));
  const fromMirror = unwrap(mirrorRead<unknown>(mirrorKey(code)));
  const best = newer(fromIdb, fromMirror);
  if (!best) return null;

  // Keep counting from the newest revision on disk so the next save is
  // recognisably later than it, rather than restarting at 1 and losing to it.
  rev = best.rev;

  // Bring the store that lost back up to date: either the mirror rescued an
  // edit IndexedDB never got, or this is the first run after the upgrade and
  // the old bare copy needs moving in.
  const healed = { rev: best.rev, savedAt: best.savedAt, doc: best.doc };
  if (best !== fromIdb) void idbPut(docKey(code), healed);
  else if (best !== fromMirror) mirrorWrite(mirrorKey(code), healed);

  return (best.doc ?? null) as T | null;
}

/**
 * Write the plan to both stores. The mirror goes first and synchronously, so
 * that a save racing the tab's close still leaves the edit somewhere.
 *
 * The revision it wrote comes back, because the shared copy is versioned with
 * the same counter: what makes one revision newer than another has to mean the
 * same thing on the device and on the server.
 */
export async function saveDoc(code: string, value: unknown): Promise<{ ok: boolean; rev: number }> {
  rev += 1;
  const at = rev;
  const record: Envelope = { rev: at, savedAt: Date.now(), doc: value };
  mirrorWrite(mirrorKey(code), record);
  return { ok: await idbPut(docKey(code), record), rev: at };
}

/**
 * Move the plan written before the picker existed into the slot of the trip it
 * belonged to, once. Called with the code that device was on; any other trip
 * must not inherit it, or creating a new trip would swallow the old plan.
 *
 * The legacy records are left where they are. They cost one plan's worth of
 * space and mean an upgrade that has to be rolled back still finds them.
 */
export async function migrateLegacyTrip(code: string): Promise<void> {
  const already = newer(
    unwrap(await idbGet<unknown>(docKey(code))),
    unwrap(mirrorRead<unknown>(mirrorKey(code))),
  );
  if (already) return; // this trip already has its own records

  const legacy = newer(
    unwrap(await idbGet<unknown>(LEGACY_DOC_KEY)),
    unwrap(mirrorRead<unknown>(LEGACY_MIRROR_KEY)),
  );
  if (!legacy) return;

  const record: Envelope = { rev: legacy.rev, savedAt: legacy.savedAt, doc: legacy.doc };
  mirrorWrite(mirrorKey(code), record);
  await idbPut(docKey(code), record);
}

/** Forget a trip's plan on this device. The shared copy is untouched. */
export async function dropDoc(code: string): Promise<void> {
  try {
    window.localStorage.removeItem(mirrorKey(code));
  } catch {
    /* storage blocked — nothing was written to remove */
  }
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(docKey(code));
  } catch {
    /* nothing to delete */
  }
}

/** Start the revision count over, for a trip this session has not loaded yet. */
export function resetRev(): void {
  rev = 0;
}

/** The revision this device last wrote. */
export function currentRev(): number {
  return rev;
}

/**
 * Take on a revision that came from the shared copy, so the next save counts
 * from it and is recognised as following it rather than losing to it.
 */
export function adoptRev(remote: number): void {
  if (remote > rev) rev = remote;
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
