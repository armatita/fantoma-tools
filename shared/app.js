/* Fantoma Tools — shared app plumbing.
 *
 * One call per tool:
 *
 *   FantomaApp.init({
 *     toolId: 'pixel-studio',
 *     accent: '#5ee88f',
 *     onImport: function () { location.reload(); }
 *   });
 *
 * That registers the service worker, asks for persistent storage, and
 * appends a standard footer panel with Export / Import / Install. Keeping
 * it here rather than in each tool means the backup format and the install
 * behaviour stay identical across every tool, which is the whole point.
 */
(function (global) {
  'use strict';

  var deferredInstall = null;

  // Captured at the top level: Chrome fires this early, often before the
  // tool has finished booting, and the event is only useful if we kept it.
  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredInstall = e;
    var btn = document.getElementById('fantoma-install');
    if (btn) btn.hidden = false;
  });

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function injectStyle(accent) {
    if (document.getElementById('fantoma-panel-style')) return;
    var css =
      '#fantoma-panel{--fa:' + accent + ';margin:22px auto 0;max-width:920px;' +
      'border:1px solid rgba(255,255,255,.10);border-radius:8px;padding:12px;' +
      'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;' +
      'font-size:12px;color:#9a9aa4;background:rgba(255,255,255,.02);}' +
      '#fantoma-panel h2{font-size:10px;letter-spacing:.12em;text-transform:uppercase;' +
      'color:var(--fa);margin:0 0 8px;font-weight:700;}' +
      '#fantoma-panel .fa-row{display:flex;gap:6px;flex-wrap:wrap;}' +
      '#fantoma-panel button{flex:1 1 auto;min-width:120px;font:inherit;cursor:pointer;' +
      'padding:8px 10px;border-radius:6px;border:1px solid rgba(255,255,255,.14);' +
      'background:rgba(255,255,255,.04);color:#f4f4f2;}' +
      '#fantoma-panel button:active{transform:translateY(1px);}' +
      '#fantoma-panel button#fantoma-install{border-color:var(--fa);color:var(--fa);}' +
      '#fantoma-panel .fa-note{margin-top:8px;line-height:1.55;color:#6b6b76;font-size:11px;}' +
      '#fantoma-panel .fa-msg{margin-top:8px;min-height:15px;color:var(--fa);font-size:11px;}' +
      '#fantoma-panel a{color:var(--fa);}';
    var style = el('style', { id: 'fantoma-panel-style' });
    style.textContent = css;
    document.head.appendChild(style);
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;   // service workers need http(s)
    global.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js', { scope: './' })
        .catch(function (err) { console.warn('[fantoma] sw registration failed', err); });
    });
  }

  function build(options) {
    var store = options.store;
    var toolId = options.toolId;

    injectStyle(options.accent || '#5ee88f');

    var panel = el('section', { id: 'fantoma-panel' });
    panel.appendChild(el('h2', {}, 'Data'));

    var row = el('div', { class: 'fa-row' });
    var exportBtn = el('button', { type: 'button' }, 'Export backup');
    var importBtn = el('button', { type: 'button' }, 'Import backup');
    var installBtn = el('button', { type: 'button', id: 'fantoma-install', hidden: 'hidden' }, 'Install app');
    row.appendChild(exportBtn);
    row.appendChild(importBtn);
    row.appendChild(installBtn);
    panel.appendChild(row);

    var msg = el('div', { class: 'fa-msg' });
    panel.appendChild(msg);

    var note = el('div', { class: 'fa-note' });
    note.innerHTML = 'Saved in this browser only &mdash; phone and computer keep separate copies, '
      + 'and clearing site data erases them. Export to move work between devices, or to keep a real backup.';
    panel.appendChild(note);

    if (!Fantoma.hasStorage) {
      note.innerHTML = '<b>Storage is unavailable in this browser</b> (private mode?). '
        + 'Nothing will be remembered after you close the tab &mdash; export before you leave.';
    }

    function say(text) {
      msg.textContent = text;
      clearTimeout(say._t);
      say._t = setTimeout(function () { msg.textContent = ''; }, 4000);
    }

    exportBtn.onclick = function () {
      var payload = store.exportAll();
      var count = Object.keys(payload.data).length;
      if (!count) { say('Nothing saved yet.'); return; }
      Fantoma.downloadJSON(toolId + '-' + Fantoma.stamp() + '.json', payload);
      say('Exported ' + count + ' item' + (count === 1 ? '' : 's') + '.');
    };

    importBtn.onclick = function () {
      Fantoma.readJSONFile().then(function (payload) {
        var replace = confirm(
          'Replace everything currently saved in ' + toolId + '?\n\n'
          + 'OK  = replace (a clean restore)\n'
          + 'Cancel = merge (keep what is here, add from the file)'
        );
        var n = store.importAll(payload, replace);
        say('Imported ' + n + ' item' + (n === 1 ? '' : 's') + '.');
        if (typeof options.onImport === 'function') options.onImport();
      }).catch(function (err) {
        if (err && err.message !== 'No file chosen.') say(err.message);
      });
    };

    installBtn.onclick = function () {
      if (!deferredInstall) return;
      deferredInstall.prompt();
      deferredInstall.userChoice.then(function () {
        deferredInstall = null;
        installBtn.hidden = true;
      });
    };

    if (deferredInstall) installBtn.hidden = false;

    (options.mountInto || document.body).appendChild(panel);
  }

  global.FantomaApp = {
    init: function (options) {
      options = options || {};
      if (!options.toolId) throw new Error('FantomaApp.init needs a toolId');

      var store = options.store || Fantoma.store(options.toolId);
      options.store = store;

      registerServiceWorker();
      Fantoma.requestPersistence();

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { build(options); });
      } else {
        build(options);
      }
      return store;
    }
  };
}(window));
