/* Fantoma Tools — shared service worker logic.
 *
 * Each tool ships a three-line sw.js that sets SW_CACHE and SW_ASSETS and
 * then importScripts() this file. One caching strategy, one place to fix it.
 *
 * THE TRAP THIS AVOIDS
 * --------------------
 * The classic PWA failure is a service worker that answers every request
 * from cache first. You push a fix, and the phone keeps serving the old
 * version forever, because the cached copy always wins and nothing ever
 * asks the network again.
 *
 * So:
 *   - Navigations (the HTML itself) are NETWORK-FIRST. Online you always get
 *     the version you just pushed; offline you fall back to the cache.
 *   - Sub-resources are STALE-WHILE-REVALIDATE: served instantly from cache,
 *     refreshed in the background, so the next load has the new file.
 *   - The cache name carries a version. Bump it and every stale cache is
 *     deleted on activate.
 *   - skipWaiting + clients.claim mean a new worker takes over immediately
 *     rather than waiting for every tab to close.
 */
/* global SW_CACHE, SW_ASSETS */
(function () {
  'use strict';

  var CACHE = self.SW_CACHE;
  var ASSETS = self.SW_ASSETS || [];

  if (!CACHE) {
    throw new Error('sw-core.js: SW_CACHE must be set before importScripts()');
  }

  // 'pixel-studio-v3' -> 'pixel-studio'. Used on activate to delete this
  // tool's older caches while leaving every other tool's cache alone.
  var FAMILY = CACHE.replace(/-v\d+$/, '');

  self.addEventListener('install', function (event) {
    event.waitUntil(
      caches.open(CACHE).then(function (cache) {
        // addAll() is atomic: one 404 and the whole install fails, which is
        // the behaviour we want -- a half-cached app is worse than none.
        return cache.addAll(ASSETS);
      }).then(function () {
        return self.skipWaiting();
      })
    );
  });

  self.addEventListener('activate', function (event) {
    event.waitUntil(
      caches.keys().then(function (names) {
        return Promise.all(names.map(function (name) {
          // Only clear this tool's old versions. Other tools on the same
          // origin have their own caches and must be left alone.
          var mine = name.indexOf(FAMILY + '-v') === 0;
          if (mine && name !== CACHE) return caches.delete(name);
          return null;
        }));
      }).then(function () {
        return self.clients.claim();
      })
    );
  });

  self.addEventListener('fetch', function (event) {
    var request = event.request;

    if (request.method !== 'GET') return;

    var url;
    try {
      url = new URL(request.url);
    } catch (e) {
      return;
    }
    // Never touch cross-origin requests (webfonts, anything else).
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
      event.respondWith(networkFirst(request));
      return;
    }
    event.respondWith(staleWhileRevalidate(request));
  });

  function networkFirst(request) {
    return fetch(request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(function () {
      return caches.match(request).then(function (cached) {
        return cached || caches.match('./index.html') || caches.match('./');
      });
    });
  }

  function staleWhileRevalidate(request) {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(request).then(function (cached) {
        var network = fetch(request).then(function (response) {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        }).catch(function () {
          return cached;   // offline and uncached: let the caller see it fail
        });
        return cached || network;
      });
    });
  }

  self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  });
}());
