/* Pixel Studio — see ../../shared/sw-core.js for the caching strategy.
 * Bump the version below whenever this tool's files change, otherwise
 * installed copies keep serving the old build from cache. */
self.SW_CACHE = 'pixel-studio-v1';
self.SW_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  '../../shared/storage.js',
  '../../shared/app.js'
];
importScripts('../../shared/sw-core.js');
