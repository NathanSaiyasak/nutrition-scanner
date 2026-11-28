// sw.js — lets the app open without internet once it has been opened once (28 Nov 2026).
// The phone keeps a copy of the app's own files (the "shell": pages, code, fonts, icons).
// Product lookups still need the internet: Open Food Facts and our shared database are never stored here,
// and without a connection the app shows its usual "No internet connection" message.
//
// On every release, change VERSION to the same rN as the ?v=rN on the files. The phone then fetches
// the new files and throws away the old copy, so it never mixes new and old code.
const VERSION = 'r22';
const CACHE = `app-shell-${VERSION}`;

// The files the app needs to start. The ones with ?v= must match index.html and the imports exactly.
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  `style.css?v=${VERSION}`,
  ...['app', 'shared-db', 'scanner', 'audit', 'add-form', 'audit-screen', 'nutrition-view', 'score',
    'dropdown', 'history', 'favorites', 'i18n', 'strings', 'app-name', 'additives', 'config', 'lookup',
    'checks', 'entry-state', 'ingredients-read', 'install'].map((f) => `${f}.js?v=${VERSION}`),
  'vendor/barcode-detector-ponyfill.js',
  'vendor/zxing_reader.wasm',
  'fonts/LINESeedSansTH-Regular.woff2',
  'fonts/LINESeedSansTH-Bold.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' skips the browser's own short-term copy, so we store what is on the site now.
    await cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('app-shell-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Open Food Facts, Supabase: always the network

  // Opening the app: try the site first so a new release shows straight away; offline, use the copy.
  if (request.mode === 'navigate') {
    const scope = new URL(self.registration.scope);
    const isApp = url.pathname === scope.pathname || url.pathname === `${scope.pathname}index.html`;
    if (!isApp) return; // About, Privacy, dashboard: not kept offline
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // The app's own files: the stored copy if we have it (fast, works offline), else the network.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    return hit || fetch(request);
  })());
});
