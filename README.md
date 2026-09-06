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
| [Model Viewer](tools/model-viewer/) | The case parts shown assembled. Pick between printed versions, colour them, download any part — or several on one plate — ready to slice |

---

## Model Viewer: the one tool with generated content

The other two author things from nothing. This one **displays what the CAD
produced**, so it has an input the others don't: `models/`, written by
`fantoma/python/case/export_viewer.py`.

```powershell
cd ..\fantoma\python\case
..\..\.venv\Scripts\python.exe export_viewer.py
```

That builds every part and version, writes `models/*.stl`, the 1:1 paper
templates, and `models/manifest.json` — which carries the part list, the
version list, and a 4×4 placement matrix per part. **The web page holds no
dimensions of its own.** Positions come from `case_params.py` by way of the
manifest, so the viewer cannot drift from the CAD; if a number is wrong it is
wrong in one place.

### The Layout tab

Drag a module around the panel and watch the web rule live. The output is four
lines of Python to paste into `case_params.py` — the tool proposes, the source
of truth still decides.

**Dragging moves a whole module, never a single feature.** Each module has
exactly one anchor in `case_params` (`JOY_POS`, `BTN_POS`, `AUX_POS`,
`BUZZ_POS`) and everything else — caps, screws, boards, the grille — is stored
as an offset from it. There is no per-feature coordinate to move, so group
dragging is not a UI convenience, it is the only thing the data allows.

The options strip is **linked** to the action buttons so the options key stays
above the red one; drag the buttons and the strip follows. The link can be
switched off.

It has two modes. **Plan** is the measuring view — rulings numbered in mm,
apertures, boards, screws, and dotted ghosts of where anything moved from.
**Render** drops all of that and fills the shapes: panel, mount plates, and
the caps in their real colours, so a layout can be judged by eye. Every colour
is a palette swatch and is remembered per element; the defaults ship in the
manifest (`layout.render` and each group's `paint` slots), so the browser is
still not the place any of them is decided.

A rule violation stays visible in Render — the offending mount gets a yellow
outline — because a layout that looks good and does not fit is the one mistake
this view could otherwise encourage.

Each group draws three rectangles: a **thin grey mount plate** (the module,
opening plus `MODULE_FLANGE` all round), the **orange aperture** inside it, and
the **dashed board** inside that. The mount is the one that decides whether the
modular panel is buildable — two apertures can clear each other comfortably
while their mounts overlap, so both are checked, the aperture against
`MODULE_MIN_WEB` and the mount against zero.

**Rotation is offered in quarter turns, but only emitted where a parameter
exists.** Today that is exactly one group: the aux strip has `AUX_VERTICAL`.
Turning anything else shows you the consequence and then says so in a comment:

```
# NOT YET EXPRESSIBLE — these turns need a CAD change first:
#   Buzzer turned 90°
```

That asymmetry is deliberate. A tool that emitted `BUZZ_ROT = 90` into a
`case_params.py` that ignores it would look like an accepted decision and
change nothing — worse than refusing to rotate at all.

**The browser holds no project geometry.** `manifest.layout` carries the
anchors, the offsets, the opening sizes and `minWeb`; the JavaScript applies
generic rectangle arithmetic and never learns what a joystick is. `check()` in
`control_panel.py` stays the authority — `export_viewer.py` refuses to publish
when it complains, so a disagreement between the two fails the export rather
than shipping. It fails closed.

**The STLs are stored in PRINT orientation, not model orientation.** Parts are
authored plate-up with their bosses hanging below, which is the natural way to
model them and exactly the wrong way to print them — the slicer would start on
the boss tips, in mid-air. `export_viewer.py` flips each part 180° about X and
drops it into the positive octant before writing the file, so a download opens
in the slicer already sitting flat on the bed. The viewer undoes that transform
for display, which is why the placement matrix lives on the *version* rather
than the part: a taller standoff has a different bounding box and therefore a
different flip.

Two consequences worth knowing:

- **Re-exporting changes the STL bytes but not their names.** Caches key on
  the name, so bump `SW_CACHE` in `tools/model-viewer/sw.js` after an export
  or an installed copy will keep showing yesterday's *models*. The manifest
  is exempt — see below — so the numbers, positions and part list are always
  current even if you forget.

- **`manifest.json` is requested as `?fresh=1`.** That flag tells
  `shared/sw-core.js` to fetch it network-first instead of the usual
  stale-while-revalidate, with the cache kept only as the offline fallback.

  Stale-while-revalidate is right for almost everything, because a file
  arriving one load late is harmless. It is wrong for a file that *describes*
  the others: a stale manifest makes the whole page quietly disagree with what
  was exported — no error, no warning, just wrong numbers. That cost four
  false diagnoses while this tool was being built.

  Note that `fetch(url, {cache: 'reload'})` does **not** solve this. The
  `cache` option is a hint to the HTTP cache, and the service worker
  intercepts the request before that and answers from its own store. Only a
  request the worker itself chooses to treat differently gets past it. The
  flag is a fixed string rather than a timestamp, so it stays exactly one
  cache entry and still works offline.
- **The models are not precached.** `install` uses `addAll()`, which is
  atomic — one missing file would fail the install outright. They are ordinary
  sub-resources instead, so stale-while-revalidate caches each one the first
  time it is viewed, and it is offline from then on.

`export_viewer.py` refuses to publish if `check()` reports a geometry problem.
A part that looks finished on screen and fails in plastic is worse than a part
that was never published.

three.js loads from a CDN rather than from this repo, which is the one place
these tools are not self-contained: the viewer needs the network on its very
first load. Everything after that is cached.

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
    model-viewer/
      index.html  manifest.webmanifest  sw.js  icons/
      models/                 GENERATED — do not hand-edit
        manifest.json         part list, versions, placement matrices
        *.stl                 one per part per version
        *.svg                 1:1 paper templates
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
