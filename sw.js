'use strict';

// Bump this revision for branch-based hosting. build:web replaces it with a
// content hash automatically for the portable static-site bundle.
const BUILD_REVISION = 'iphone-android-20260914-2';
const CACHE_PREFIX = 'texas-holdem:' + self.registration.scope + ':';
const CACHE_NAME = CACHE_PREFIX + BUILD_REVISION;
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './mobile.css',
  './renderer.js',
  './pwa.js',
  './src/poker-engine.js',
  './src/mccfr-policy.js',
  './src/ai-engine.js',
  './src/session-store.js',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest'
];
const APP_URLS = APP_SHELL.map((path) => new URL(path, self.registration.scope).href);

async function cacheApp() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_URLS.map((url) => new Request(url, { cache: 'reload' })));
}

self.addEventListener('install', (event) => {
  // An update waits until the player accepts it or all old windows close.
  event.waitUntil(cacheApp());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  } else if (event.data && ['OFFLINE_STATUS', 'REPAIR_OFFLINE'].includes(event.data.type)) {
    event.waitUntil((async () => {
      try {
        if (event.data.type === 'REPAIR_OFFLINE') await cacheApp();
        const cache = await caches.open(CACHE_NAME);
        const contents = await Promise.all(APP_URLS.map((url) => cache.match(url)));
        if (event.ports[0]) event.ports[0].postMessage({ ready: contents.every(Boolean), version: BUILD_REVISION });
      } catch (error) {
        if (event.ports[0]) event.ports[0].postMessage({ ready: false, version: BUILD_REVISION });
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  url.search = '';
  url.hash = '';
  const appAsset = APP_URLS.includes(url.href);
  const navigation = event.request.mode === 'navigate';
  if (!appAsset && !navigation) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = appAsset ? url.href : new URL('./index.html', self.registration.scope).href;
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok && appAsset && response.type !== 'opaque') await cache.put(key, response.clone());
      return response;
    } catch (error) {
      return navigation ? (await cache.match(new URL('./index.html', self.registration.scope).href)) || Response.error() : Response.error();
    }
  })());
});
