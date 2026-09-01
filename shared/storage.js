/* Fantoma Tools — shared storage.
 *
 * Loaded as a plain script (no modules) so every tool stays a single page
 * that also works when opened straight off disk.
 *
 * WHY THIS EXISTS
 * ---------------
 * localStorage is scoped to the ORIGIN, not the path. Every tool published
 * under https://<user>.github.io shares one storage bucket -- and so does
 * every other GitHub Pages site on that account. Two tools that both reach
 * for a key called "saves" will silently overwrite each other.
 *
 * So no tool talks to localStorage directly. Each one asks for a Store,
 * which prefixes every key with `fantoma:<tool-id>:`. Collisions become
 * impossible rather than merely unlikely.
 *
 * The other half of the job: localStorage does NOT sync between devices and
 * can be evicted by the browser under storage pressure. Export/import is the
 * answer to both -- it is the only way data moves from phone to computer,
 * and it is the real backup.
 */
(function (global) {
  'use strict';

  var PREFIX = 'fantoma:';
  var FORMAT = 1;

  function available() {
    try {
      var probe = PREFIX + '__probe';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;   // private browsing, or storage disabled entirely
    }
  }

  var HAS_STORAGE = available();
  var memory = {};    // fallback so a tool still runs, it just forgets

  function rawGet(key) {
    if (!HAS_STORAGE) return key in memory ? memory[key] : null;
    return localStorage.getItem(key);
  }

  function rawSet(key, value) {
    if (!HAS_STORAGE) { memory[key] = value; return true; }
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      // Almost always QuotaExceededError: ~5MB per origin, shared by all tools.
      console.warn('[fantoma] could not save "' + key + '"', e);
      return false;
    }
  }

  function rawRemove(key) {
    if (!HAS_STORAGE) { delete memory[key]; return; }
    localStorage.removeItem(key);
  }

  function Store(toolId) {
    this.toolId = toolId;
    this.prefix = PREFIX + toolId + ':';
  }

  Store.prototype.key = function (name) {
    return this.prefix + name;
  };

  Store.prototype.get = function (name, fallback) {
    var raw = rawGet(this.key(name));
    if (raw === null || raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[fantoma] corrupt value at "' + name + '", ignoring');
      return fallback;
    }
  };

  Store.prototype.set = function (name, value) {
    return rawSet(this.key(name), JSON.stringify(value));
  };

  Store.prototype.remove = function (name) {
    rawRemove(this.key(name));
  };

  Store.prototype.names = function () {
    var out = [];
    var i;
    if (!HAS_STORAGE) {
      for (var m in memory) {
        if (m.indexOf(this.prefix) === 0) out.push(m.slice(this.prefix.length));
      }
      return out;
    }
    for (i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(this.prefix) === 0) out.push(k.slice(this.prefix.length));
    }
    return out;
  };

  /* One-off rescue for keys written before the prefix scheme existed. */
  Store.prototype.adoptLegacyKeys = function (mapping) {
    var marker = '__migrated';
    if (this.get(marker)) return false;
    var moved = false;
    for (var oldKey in mapping) {
      if (!Object.prototype.hasOwnProperty.call(mapping, oldKey)) continue;
      var raw = rawGet(oldKey);
      if (raw === null) continue;
      if (rawGet(this.key(mapping[oldKey])) === null) {
        rawSet(this.key(mapping[oldKey]), raw);
        moved = true;
      }
    }
    this.set(marker, FORMAT);
    return moved;
  };

  /* ---- export / import: the only route between devices ---- */

  Store.prototype.exportAll = function () {
    var data = {};
    var names = this.names();
    for (var i = 0; i < names.length; i++) {
      if (names[i].indexOf('__') === 0) continue;   // internal bookkeeping
      data[names[i]] = rawGet(this.key(names[i]));
    }
    return {
      format: FORMAT,
      tool: this.toolId,
      exportedAt: new Date().toISOString(),
      data: data
    };
  };

  Store.prototype.importAll = function (payload, replace) {
    if (!payload || typeof payload !== 'object' || !payload.data) {
      throw new Error('That file is not a Fantoma backup.');
    }
    if (payload.tool && payload.tool !== this.toolId) {
      throw new Error('That backup is for "' + payload.tool + '", not this tool.');
    }
    if (replace) {
      var existing = this.names();
      for (var i = 0; i < existing.length; i++) this.remove(existing[i]);
    }
    var count = 0;
    for (var name in payload.data) {
      if (!Object.prototype.hasOwnProperty.call(payload.data, name)) continue;
      rawSet(this.key(name), payload.data[name]);
      count++;
    }
    return count;
  };

  /* ---- module surface ---- */

  global.Fantoma = {
    hasStorage: HAS_STORAGE,

    store: function (toolId) {
      return new Store(toolId);
    },

    /* Ask the browser not to evict this origin when space runs short.
     * Installed apps are usually granted it without prompting. */
    requestPersistence: function () {
      if (!navigator.storage || !navigator.storage.persist) {
        return Promise.resolve(false);
      }
      return navigator.storage.persisted()
        .then(function (already) {
          return already ? true : navigator.storage.persist();
        })
        .catch(function () { return false; });
    },

    downloadJSON: function (filename, obj) {
      var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },

    readJSONFile: function () {
      return new Promise(function (resolve, reject) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = function () {
          var file = input.files && input.files[0];
          if (!file) { reject(new Error('No file chosen.')); return; }
          var reader = new FileReader();
          reader.onload = function () {
            try {
              resolve(JSON.parse(String(reader.result)));
            } catch (e) {
              reject(new Error('That file is not valid JSON.'));
            }
          };
          reader.onerror = function () { reject(new Error('Could not read that file.')); };
          reader.readAsText(file);
        };
        input.click();
      });
    },

    stamp: function () {
      var d = new Date();
      function pad(n) { return n < 10 ? '0' + n : '' + n; }
      return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
        + '-' + pad(d.getHours()) + pad(d.getMinutes());
    }
  };
}(window));
