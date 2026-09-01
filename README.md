# Fantoma Tools

Browser tools for the Fantoma project, published as installable web apps.

Each tool is a single static HTML page. There is no build step, no framework
and no server — `git push` is the deploy. On a phone or a desktop each tool
installs as its own icon and opens in its own window, with no browser chrome
and no app store involved.

Live at: `https://<your-github-username>.github.io/fantoma-tools/`

---

## The tools

| Tool | What it does |
| --- | --- |
| [Pixel Studio](tools/pixel-studio/) | Draw sprites on an 8/16/32 grid, export PNG |
| [SFX Forge](tools/sfx-forge/) | Compose buzzer melodies and frequency sweeps, export a `SoundStep[]` C array for `cpp/fantoma/sound.h` |

---

## Publishing to GitHub Pages

One-time setup:

1. Create an empty repo on GitHub named `fantoma-tools` (public — GitHub Pages
   from a private repo needs a paid plan).
2. From this folder:

   ```powershell
   git init
   git add -A
   git commit -m "Fantoma Tools: pixel-studio, sfx-forge"
   git branch -M main
   git remote add origin https://github.com/<your-username>/fantoma-tools.git
   git push -u origin main
   ```

   (One command per line: Windows PowerShell 5.1 has no `&&` operator — it is
   a parser error, not a missing feature. Use `;` to chain unconditionally, or
   `cmd1; if ($?) { cmd2 }` to chain on success.)

3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, branch `main`, folder `/ (root)`. Save.
4. Wait a minute, then open `https://<your-username>.github.io/fantoma-tools/`.

After that, every `git push` republishes within a minute or so.

`.nojekyll` is in the repo root on purpose: without it GitHub runs the files
through Jekyll, which quietly ignores any directory starting with `_`.

---

## Installing a tool

Open the tool's own page first — not the hub — then:

- **Android (Chrome):** menu **⋮** → **Add to Home screen** → **Install**.
  Choosing *Install* rather than *Shortcut* is what gets you a real app entry
  in the drawer and the task switcher.
- **Windows (Chrome / Edge):** the install icon at the right of the address
  bar, or menu → **Cast, save and share** → **Install page as app**.

Each tool declares its own manifest with its own `id` and `scope`, which is why
they install as separate apps with separate icons rather than one bookmark.

---

## How data is stored

**Read this before changing anything that saves.**

`localStorage` is scoped to the **origin** (`https://<user>.github.io`), not to
the path. Every tool here shares one storage bucket, and so does every other
GitHub Pages site on the same account. Two tools that both write a key called
`saves` will silently destroy each other's data.

So no tool talks to `localStorage` directly. Each asks for a namespaced store:

```js
const store = Fantoma.store('pixel-studio');   // keys become fantoma:pixel-studio:<name>
store.set('current', state);
const state = store.get('current', defaultValue);
```

Three consequences worth remembering:

- **There is no sync.** The phone and the computer keep entirely separate
  copies. Moving work between them means **Export backup** on one device and
  **Import backup** on the other. This is deliberate: real sync would mean
  putting an account token inside a web page.
- **Storage can be evicted.** Android clears it under storage pressure, and
  "clear browsing data" wipes it outright. The tools call
  `navigator.storage.persist()` to ask for protection, which installed apps are
  usually granted, but export is the only real backup.
- **The budget is about 5 MB for all tools combined.** `store.set()` returns
  `false` when it fails rather than throwing — check it if you are saving
  anything large.

---

## Repo layout

```
fantoma-tools/
  index.html                  hub / launcher (installable in its own right)
  manifest.webmanifest
  sw.js
  .nojekyll                   stops GitHub Pages running Jekyll
  icons/
  shared/
    storage.js                namespaced store + export/import helpers
    app.js                    SW registration, install prompt, Data panel
    sw-core.js                the one caching strategy, shared by every tool
    theme.css                 hub styling only; tools keep their own look
  scripts/
    make_icons.py             regenerates every icon (no dependencies)
  tools/
    pixel-studio/
      index.html  manifest.webmanifest  sw.js  icons/
    sfx-forge/
      index.html  manifest.webmanifest  sw.js  icons/
```

---

## Updating a tool

**Bump the cache version in that tool's `sw.js` whenever you change its files:**

```js
self.SW_CACHE = 'pixel-studio-v2';   // was v1
```

If you forget, installed copies may keep serving files from the old cache and
your fix will appear not to have deployed. The caching strategy is deliberately
built to make that hard — page loads are network-first, so the HTML is always
fresh when you are online — but sub-resources are served from cache first and
refreshed in the background, so they land one load late unless the version
changes.

To verify a deploy on the phone: open the tool, pull to refresh, and check the
change is there. If it is stubbornly stale, Chrome → site settings → clear data
for the origin will force a clean install.

---

## Adding a new tool

1. `mkdir tools/<tool-id>` and drop `index.html` in it.
2. Copy `manifest.webmanifest` and `sw.js` from an existing tool; change the
   `name`, `short_name`, `description`, `theme_color`, and `SW_CACHE`.
3. Add an icon builder to `scripts/make_icons.py`, register it in the `ICONS`
   dict, and run `python scripts/make_icons.py`.
4. In the page, before your own script:

   ```html
   <script src="../../shared/storage.js"></script>
   <script src="../../shared/app.js"></script>
   ```

   and at the end of your script:

   ```js
   const store = Fantoma.store('<tool-id>');
   FantomaApp.init({
     toolId: '<tool-id>',
     store: store,
     accent: '#5ee88f',
     onImport: function () { /* re-read state and re-render */ }
   });
   ```

   That one call registers the service worker, requests persistent storage, and
   appends the standard Export / Import / Install panel.
5. Add a tile to `index.html`, and add the tool's files to its `SW_ASSETS`.

---

## Local development

```bash
python -m http.server 8765 --directory fantoma-tools
```

Then open `http://localhost:8765/`. Service workers need HTTPS *or* localhost,
so opening the files directly with `file://` will work for the tool itself but
skips all the offline machinery.
