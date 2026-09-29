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
 *
 * THE SECOND TRAP: THE BROWSER'S OWN CACHE
 * ----------------------------------------
 * Underneath the service worker sits the ordinary HTTP cache, and GitHub
 * Pages serves every file with `Cache-Control: max-age=600` -- "reuse this
 * for ten minutes without asking". A plain fetch() from here honours that.
 * So "network-first" could quietly mean "the copy from nine minutes ago",
 * and worse, a NEW worker's install could precache the OLD files and then
 * serve them from its brand-new cache. Found when the installed hub kept its
 * pre-update page after a push.
 *
 * Hence every fetch below states its cache mode:
 *   - install uses cache: 'reload'   -- always straight from the server;
 *   - everything else uses 'no-cache' -- always CHECK with the server, which
 *     costs a tiny 304 Not Modified when nothing changed (Pages sends ETags).
 * And the page registers this worker with updateViaCache: 'none', so the
 * update check on sw.js and on this file skips the HTTP cache too.
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
        return cache.addAll(ASSETS.map(function (url) {
          return new Request(url, { cache: 'reload' });
        }));
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

    // Opt-in freshness: a sub-resource asked for with ?fresh=1 is treated
    // like a navigation — network first, cache only as the offline fallback.
    //
    // Stale-while-revalidate is right for almost everything, because a file
    // arriving one load late is harmless. It is wrong for a file that
    // DESCRIBES the others: model-viewer's manifest carries the geometry, so
    // a stale copy makes the whole page quietly disagree with what was
    // exported, with no error to notice. Cheap files that other files are
    // interpreted against want this; bulk assets do not.
    //
    // The flag is a fixed string, not a timestamp, so it is still exactly one
    // cache entry and still works offline.
    if (url.searchParams.get('fresh') === '1') {
      event.respondWith(networkFirst(request));
      return;
    }

    event.respondWith(staleWhileRevalidate(request));
  });

  // Passing an init turns a navigation into a same-origin request, which is
  // allowed; its 'manual' redirect mode is kept, so a redirect still comes
  // back as something a navigation can use.
  function fromNetwork(request) {
    return fetch(request, { cache: 'no-cache' });
  }

  function networkFirst(request) {
    return fromNetwork(request).then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
      }
      return response;
    }).catch(function () {
      // caches.match() returns a Promise, which is always truthy, so these
      // fallbacks have to be chained -- an `a || b || c` of them never
      // reaches c.
      return caches.match(request).then(function (cached) {
        return cached || caches.match('./index.html');
      }).then(function (cached) {
        return cached || caches.match('./');
      });
    });
  }

  function staleWhileRevalidate(request) {
    return caches.open(CACHE).then(function (cache) {
      return cache.match(request).then(function (cached) {
        var network = fromNetwork(request).then(function (response) {
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
