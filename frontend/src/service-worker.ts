/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly, CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

// Precache all app shell assets (injected by Vite PWA plugin)
precacheAndRoute(self.__WB_MANIFEST);

// Backend API: always network-only (never cache)
registerRoute(
  ({ url }) =>
    url.hostname === 'script.google.com' ||
    url.hostname.includes('googleusercontent.com'),
  new NetworkOnly(),
);

// Reverse geocoding API: network-only
registerRoute(
  ({ url }) => url.hostname === 'nominatim.openstreetmap.org',
  new NetworkOnly(),
);

// CDN fonts/icons: cache on first use
registerRoute(
  ({ url }) =>
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net',
  new CacheFirst({ cacheName: 'cdn-cache' }),
);

// Update flow: notify clients when new version available
// Do NOT call skipWaiting automatically — let the user trigger it
self.addEventListener('install', (_event) => {
  // Do not skip waiting here
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
