/* Fantoma Tools hub — see shared/sw-core.js for the caching strategy.
 * Bump the version below whenever the hub's files change. */
self.SW_CACHE = 'fantoma-hub-v1';
self.SW_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './shared/theme.css'
];
importScripts('./shared/sw-core.js');
