/* Service worker: makes the planner open instantly and survive a bad signal. */

const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const TILES = `tiles-${VERSION}`;
const ASSETS = `assets-${VERSION}`;

// Map tiles are the bulk of what a traveler wants offline, and the bulk of the
// bytes — keep a generous but bounded number of them.
const TILE_LIMIT = 600;
const ASSET_LIMIT = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/icons/icon-192.png', '/icons/icon-512.png']))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Drop the oldest entries once a cache grows past its limit. */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((k) => cache.delete(k)));
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') {
      cache.put(request, res.clone());
      trim(cacheName, limit);
    }
    return res;
  } catch (err) {
    const stale = await cache.match(request);
    if (stale) return stale;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const net = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone());
        trim(cacheName, limit);
      }
      return res;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Routing and geocoding are POST/queries whose answers change — never served
  // from the shell cache. They fail honestly offline and the UI says so.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) return;

  // The page itself: network first, so a deploy is picked up, cache as backup.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put('/', res.clone());
          return res;
        } catch {
          const cache = await caches.open(SHELL);
          return (await cache.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Map tiles, glyphs and sprites.
  if (/tiles\.openfreemap\.org|basemaps|\.pbf($|\?)|\/fonts\//.test(url.href)) {
    event.respondWith(cacheFirst(request, TILES, TILE_LIMIT));
    return;
  }

  // Fonts, icon webfonts and anything Next fingerprinted.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))
  ) {
    event.respondWith(cacheFirst(request, ASSETS, ASSET_LIMIT));
    return;
  }

  if (/fonts\.(googleapis|gstatic)\.com|unpkg\.com/.test(url.href)) {
    event.respondWith(staleWhileRevalidate(request, ASSETS, ASSET_LIMIT));
  }
});
