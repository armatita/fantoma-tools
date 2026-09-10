/* Model Viewer — see ../../shared/sw-core.js for the caching strategy.
 * Bump the version below whenever this tool's files change, otherwise
 * installed copies keep serving the old build from cache.
 *
 * The STL files are deliberately NOT listed here. install uses addAll(),
 * which is atomic: one missing model would fail the whole install and leave
 * the tool uninstallable. Models are sub-resources, so sw-core's
 * stale-while-revalidate picks them up the first time they are viewed and
 * they are offline from then on. Re-exporting changes their bytes but not
 * their names, so bump the version here after an export or the viewer will
 * show yesterday's geometry. */
self.SW_CACHE = 'model-viewer-v22';
self.SW_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './models/manifest.json?fresh=1',
  '../../shared/storage.js',
  '../../shared/app.js'
];
importScripts('../../shared/sw-core.js');
