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
| [Pixel Studio](tools/pixel-studio/) | Draw sprites on an 8/16/32 grid, export PNG at actual size (1×) or enlarged 4/8/16× |
| [SFX Forge](tools/sfx-forge/) | Compose buzzer melodies and frequency sweeps, export a `SoundStep[]` C array for `cpp/fantoma/sound.h` |
| [Model Viewer](tools/model-viewer/) | The case parts shown assembled. Pick between printed versions, colour them, download any part — or several on one plate — ready to slice |
| [Protoplaca](tools/protoplaca/) | Replace a breadboard with a printed plate. Draw the components and the wires between them; get bosses and wire tunnels to print, and a 3D tab that says whether it all fits. English and European Portuguese |
| [Canvas](tools/canvas/) | Palettes, sprites and scenes for the arcade engine, shown as the panel will show them; exports what `fantoma/docs/image-format.md` specifies. Desktop only. Being built in phases |

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

### The `id` is an identity: absolute, unique, never changed

Chrome recognises an installed app by its manifest `id` — not by its name, and
not by its URL. Every manifest here spells it out as an absolute path:

| App | `id` |
| --- | --- |
| hub | `/fantoma-tools/` |
| each tool | `/fantoma-tools/tools/<tool-id>/` |

**Never write a relative `id`.** It is resolved against the *origin* of
`start_url`, not against the manifest's folder, so `"id": "./"` in every
manifest gave the hub and every tool the same identity,
`https://armatita.github.io/`. That is how it was originally shipped, and the
symptom was Chrome offering to rename the installed hub "Pixel Studio" whenever
the hub's window opened that tool: it read Pixel Studio's manifest as an update
to the hub. Anything installed before the fix (September 2026) had that shared
identity and needed one reinstall.

**Never change an `id` once published** — not even if the repo is renamed.
Changing it orphans every existing install: the app keeps running but no
longer receives manifest updates, and has to be reinstalled.

### Getting back to the hub

You can also install just the hub and open everything from it. The hub's scope
(`/fantoma-tools/`) contains every tool, so a tile opens the tool *inside the
hub's window* — and an installed app window has no back button. So each tool
shows a **← Fantoma Tools** link at the top when it was opened from the hub
(`Alt+←` also works on the desktop, as does the back gesture on Android).

The link is deliberately **hidden when a tool runs as its own installed app**:
the hub is outside that app's scope, and Chrome would open it with a URL strip
across the top like a stray web page. The mechanism: the hub adds `#from-hub`
to its tile links; `shared/app.js` records that in `sessionStorage` (which
belongs to one window, so it survives reloads there and never leaks into a
separately installed tool's window) and strips the hash. In an ordinary browser
tab the link always shows. None of this needs any code in the tools themselves.

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
    check_header.py           proves a Canvas export by decoding it (see Canvas)
    aseprite_test_files.lua   Aseprite writes test files for Canvas's .aseprite reader
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
    protoplaca/
      index.html  manifest.webmanifest  sw.js  icons/
      DESIGN.md               what it is for, and why each decision went the way it did
    canvas/
      index.html  manifest.webmanifest  sw.js  icons/
```

---

## Protoplaca: the one tool that is not about Fantoma

It lives here because this is where the tools live, and it shares the shell —
one static page, no build step, the storage layer, the service worker. It shares
nothing else: it must never reach into `fantoma/python/case` or `case_params.py`.
If it ever needs to, the feature belongs in Fantoma rather than here.

It is also the first bilingual tool. Every user-visible string sits in one
catalogue at the top of its script, in English and European Portuguese; the
language is remembered per browser. The shared Export / Import panel is still
English, because that lives in `shared/app.js` and is used by three tools that
have no translations.

`tools/protoplaca/DESIGN.md` carries the reasoning — the coordinate convention,
why the STL is derived rather than stored, why there is no CAD kernel, and why
tunnels are the default but the ends of a wire are not. Read it before changing
geometry decisions.

**Phase 1 is built.** The drawing surface — plate, grid, rulers, pan and zoom,
guides, measuring, a cursor crosshair. The document — components with their
three heights, autosave into this browser, and `.protoplaca.json` to open and
save. Bosses — screw size, fixing type, height, attached to the component they
hold. And binary STL out, with a calibration coupon you can print to find your
own hole sizes.

Holes are blind, which is right for self-tapping screws and heat-set inserts.
Clearance bosses are **not** drilled through the plate yet — that needs the same
triangulation as recessed text and waits for it. The export panel says so.

The print profile carries the hole sizes, and each one says where it came from
— measured on a real print, a standard table size, or assumed. The M2 and M3
self-tap pilots are measured, from the sweeps in `print_tests/`. Nothing is
promoted to measured without you measuring it.

**Phase 2 is built too**: wires drawn point by point with snapping to square
and 45°, ends that attach to the component they start on, colour, name, AWG
and outside diameter, drawn at their real width so congestion is visible. The
length readout gives its parts rather than one number, so you can see which
jumper to reach for.

Clearance bosses are now cut through the plate, so a screw can pass and take a
nut. Self-tapping and heat-set bosses keep their blind holes, which is what
they want.

Raised text is in, from a stroke font, so the calibration coupon now labels
every hole on the plate itself: a column per screw size, a row per fixing, and
a key along the bottom.

**Phase 3 is built**: retainers — the tunnels and clips that hold the wires
down. Place them by hand or press auto, which puts one at every direction
change and fills the long straights between. An automatic one you delete stays
deleted. Where two wires cross, one is lifted over the other by raising a
retainer's opening rather than by inventing a new kind of part. There is a
retainer coupon, three gauges by three kinds, still waiting on a printer.

**Phase 4 is built**: a 3D tab. The print as the STL will carry it, the
components as the boxes their three heights describe, and the wires as tubes at
their real diameter — each layer switchable, all of it rebuilt from the
document so the two views cannot disagree. Alongside it a clash list: what is
under a board that should not be, which two components occupy the same space,
which wire has nowhere to run. Each one is drawn in red where the two things
actually meet.

The renderer is written against WebGL directly rather than pulling in three.js,
because this tool claims to work offline and a page that needs the network to
draw half of itself does not. `DESIGN.md` argues it properly.

**Phase 5 is built**: ribs. A stiffening wall drawn with the wire tool's
gesture and standing on the plate, because that is the side the printer can
build on. Where a wire crosses one, the rib arches over it; where the rib is too
short to carry a roof, it stops either side; where it cannot do either, the
clash list says which and why. T3 set the floor at 1.0 mm, and the warning says
what actually happens below it — a thin rib prints and then comes away at the
joint to the plate.

Components and wires pick their colour from the model viewer's palette, plus a
brown and a violet that a ribbon has and a case does not. Copied into the page,
not read from the model viewer's manifest, because that file is generated by
Fantoma.

The retainer coupon has been printed. Both tunnels work, the square roof leaving
debris in the bore that the arch does not. Clips grip 22 AWG lightly and do not
hold 18 AWG at all, so `clipMaxOd` is 1.7 and automatic placement puts tunnels
at the ends of anything thicker.

Raised lettering took three printings to get right, and the write-up in
`DESIGN.md` is worth reading before touching it: the pen has to be a whole
number of extrusions or the slicer draws every letter with two lines, the letter
advance has to include the pen or the letters touch, and no glyph segment may be
shorter than the pen laying it down. The consequence is that on a 0.4 mm nozzle
the smallest legible cap height is 4.8 mm, and the tool says so rather than
letting bad text out quietly.

Heat-set inserts are the last thing standing on assumption, and they have to be
ordered before they can be measured.

**A paper template**, next to the STL button: the plate at 1:1 as a one-page
PDF, to lay the real parts on before spending printer time. The decisions, and
why:

- **A PDF, not an image.** A PNG has no physical size that printing honours;
  a PDF page *is* 210 × 297 mm. It asks viewers not to scale
  (`/PrintScaling /None`), which some honour, and that is not trusted: there
  are two **50 mm check bars**, one per axis, because a printer can be off in
  one direction only. Print at 100% / "Actual size", never "Fit to page".
- **Drawn by the editor's own drawing code**, pointed at an offscreen canvas
  for one render, so the paper cannot drift from the screen. The screen's
  furniture — rulers, guides, selection, measure — stays off it; the
  Dimensions toggle carries over. Rasterised at up to 300 dpi and embedded
  losslessly; the PDF is written by hand (six objects), not by a library.
- **Measured, not assumed:** on a 150 × 90 mm test plate the rendered outline
  came out 150.02 × 89.97 mm and both bars 50 mm, i.e. within one 300 dpi pixel.
  Screen line snapping is switched off for the render, and the plate outline is
  redrawn at its exact size over the editor's rounded one.
- **A graph-paper grid of its own** — 0.1 mm lines every mm, 0.2 mm every
  10 mm — because the screen's 1 px grid is 0.26 mm on paper, a grey wash.
- **The smallest ISO page that fits**, A4 first, turned landscape if that is
  what fits; past A4 the message says so, since most home printers stop there.
  Big pages lower the dpi to stay under 12 megapixels, for phones.

---

## Canvas: art for the arcade engine, built in phases

Composes palettes, sprites and scenes and previews them the way the LED panel
will show them. Its contract with the engine is **`fantoma/docs/image-format.md`**:
the export follows that file and nothing else. What the engine does not read
-- preview colliders, paths, scene placement -- lives only in Canvas's own
`.canvas.json`, so it can change without touching the engine. Desktop only;
Pixel Studio is the phone tool. English only, being Pedro's own.

**Phase 1 is built**: the shell, the project file, and palettes.

- **Colour is shown as the panel receives it.** Every swatch is cut to RGB565 by
  truncation, exactly as `rgb565()` in `image.h` and `img2c.py` do, then
  expanded back by bit replication, as `rgb565_r8/g8/b8` do on the way to the
  panel. The panel's own response (its CIE1931 curve, the acrylic) is not
  modelled: the spec records it as unmeasured, and a guessed curve would only
  look authoritative. A `≈` marks a colour the panel cannot show exactly;
  "Snap to 565" makes what is stored equal what is seen.
- **The palette type is computed, never typed**: 1, 2, 4 or 8 bpp, because those
  are the only depths `image.h` has. Beside it, the same palette with a
  transparent slot, flagged when that slot doubles every sprite's size, as the
  spec asks tools to say.
- **Byte costs are the engine's**: rows round up to whole bytes
  (`stride = ceil(w * bpp / 8)`), so a 10 px row at 1 bpp costs 2 bytes.
- **Order is identity.** A sprite stores palette *positions*, and a palette
  swap only works if index 2 means the same thing in every palette; so indices
  are shown on every swatch and reordering is deliberate (drag, or Alt+arrows).
- **Aseprite round trip**: export a palette as `.gpl` and load it in Aseprite;
  art drawn with it carries the exact stored colours, which is what phase 2's
  import will match pixels to indices by. Import reads `.gpl`, JASC `.pal` and
  Lospec `.hex`.
- **Undo from the start**: whole-document snapshots, because a project is a few
  kilobytes and a snapshot cannot forget to describe its own inverse.
- **Camera and scene size are per project**, never hardcoded; 64 × 64 is only
  the default.

**Phase 2 is built**: objects, states and frames, imported from Aseprite.

- **Import reads Export Sprite Sheet output** -- the PNG and its JSON, Array or
  Hash. The JSON says where every frame is; a grid is never guessed from the
  sheet's size (the hero sheet divides evenly both ways and was once read wrong).
  Tags become states; a file with no tags is one state named after the file.
  Trimmed frames are put back in their cell; packed/rotated sheets are refused.
  Pixels are read with colour management off, so an embedded profile cannot
  shift a colour off its palette entry.
- **Colours match exactly or not at all.** Missing colours can be appended to
  the palette (nothing moves) or a new palette made from the art; a "nearest"
  colour is never substituted.
- **Art is stored as palette indices**, as the engine stores it. Editing a
  colour recolours every sprite drawn with it; pointing an object at another
  palette previews a swap; reordering or inserting colours rewrites the art so
  it looks unchanged; deleting a colour or palette in use is refused, with
  where it is used.
- **Transparency is read from the art** (alpha below 128, the spec's rule), and
  is the whole object's, because its states share one palette.
- **The preview is the device's arithmetic**: `image_frame_at()`'s divide and
  modulo, on elapsed time floored to the 16 ms display tick. Reverse and
  ping-pong are expanded the way the export will expand them. Empty pixels
  are dark grey by default: black is what an unlit LED is, but it is also the
  usual outline colour, and an outline on black disappears.
- **The flash budget** counts expanded frames, byte-aligned rows, the palette,
  and a 24-byte `Image` plus a 4-byte table entry per state (ESP32 pointers).
- **Names are C symbols**, made valid on import (`Loop` becomes `loop`) and
  refused where they would collide with the header's own (`palette`, `states`,
  `state_count`, the cell and box defines, anything ending `_data`).

**Phase 3 is built**: the export, one C header per object, from the Export
section under the flash budget (**Download `<obj>.h`**, or **Copy**).

- **The header is the one `image-format.md` shows**: one shared
  `<obj>_palette[1 << bpp]` (RGB565 by truncation, padded with `0x0000`); per
  state a `<obj>_<state>_data[]` and an `Image` with every field in
  declaration order, `frame_ms = 0` for a still; then
  `enum { <OBJ>_<STATE> = 0, ..., <OBJ>_STATE_COUNT }`,
  `<obj>_states[<OBJ>_STATE_COUNT]`, and `<OBJ>_CELL_W/H`, `<OBJ>_BOX_W/H`.
- **Transparency is slot 0**, and every stored index `k` is written as `k + 1`,
  as `img2c.py --transparent` does. Reverse and ping-pong are expanded into
  forward frames (`playOrder()`, the preview's own order).
- **The include guard is `CANVAS_<OBJ>_H`**, not `<OBJ>_H`: a state named `h`
  would make that an enum value as well, and the header would not compile.
- **The `#include` path is per project**, with the two known answers offered:
  `../engine/image.h` for `cpp/fantoma/assets/`, `../../fantoma/engine/image.h`
  for the `cpp/refactor/` workbench.
- **Refused**: no palette, more than 256 slots, an index past the palette, a
  name problem, a symbol defined twice, a symbol `image.h` already defines
  (object `image` + state `row` is `image_row()`), and a clash with another
  object in the project (`hero` + `idle_x` vs `hero_idle` + `x`).
- **Warned**, in the panel and in the header's opening comment so the note
  travels with the file: transparency bumping the bpp, colours that are one
  RGB565 value, durations under the 16 ms tick or of 0, play-once (exported as
  a loop: no `ANIM_ONCE` yet), per-frame durations flattened, a box offset
  the engine ignores, an empty box, a clash with `build_hero.py`'s headers,
  and for `hero`, the unrelated `games/platformer/hero.h`.
- **A self-check on every export**: the packed bytes are read back the way
  `image_pixel()` reads them and compared with the art, pixel by pixel. A
  packing bug stops the export instead of reaching the panel looking like an
  art problem.

**How it was proven** (2026-09-29), with `scripts/check_header.py`: a decoder
written from `image.h`, not from Canvas's JavaScript, that compares headers
image by image -- the same fields, and the same RGB565 colour or transparency at
every pixel of every frame. Not a byte diff: `img2c.py`'s palette order is
Pillow's choice, Canvas's is the author's.

- `hero.h`, imported from the hero sheet by `build_hero.py`'s rules (4x8
  cells, eleven tags), against the eleven `cpp/refactor/assets/hero_*.h`:
  **all 11 states, 38 frames, identical.**
- Six synthetic sprites against `img2c.py` on the same pixels, for what the
  hero does not exercise: 1 bpp (opaque, and one colour + transparent),
  2 bpp, 4 bpp and 8 bpp, rows ending mid-byte, reverse, ping-pong, a still.
  **All identical.**
- The checker was shown to fail: a flipped pixel, a changed `frame_ms`, two
  swapped fields, a short palette and a reordered enum are each caught.
- Every export compiles as C99 and C++20 under
  `-Wall -Wextra -Werror -pedantic` (MSYS2 gcc 15), and a dump through
  `image.h`'s own `image_decode_row_idx()` matches the Python decoder row for
  row.

```bash
python scripts/check_header.py hero.h --against ../fantoma/cpp/refactor/assets/hero_*.h
```

The glob also matches the hand-written `hero_sprites.h`, which has no `Image`
of its own and only adds a line to the listing. **Still to do: compile it in
the sketch** (`.\flash build`, compile only), which is the one check that uses
the real ESP32 toolchain and the sketch's own flags.

**Phase 4 is built**: the scene, a preview of what the engine will draw.
Built on the workbench engine's own model (`cpp/refactor/engine/object.h`
and `scene.h`), so anything arranged here is something the device can show.
Nothing in it is exported.

- **Six draw bands, not free layers**: `backdrop, back, play, play front,
  foreground, hud`, named after the engine's `LAYER_*`. This replaces the
  earlier "three layers, move above/below": the engine has bands, so "above"
  means a later band. Within a band the engine draws in pool-slot order,
  which nobody authors; Canvas draws in list order and **warns when two
  sprites overlap in one band**, the one place its order and the device's can
  differ.
- **Per instance, the engine's flags**: flip X / flip Y (`OBJ_FLIP_X/_Y`,
  the whole cell), fixed to the screen (`OBJ_FIXED`: screen coordinates, for
  a HUD or a backdrop that does not scroll), hidden (`OBJ_HIDDEN`). Toggling
  "fixed" converts the position so the instance stays where it is.
- **The scene's `bg_color`**, a camera position (dragged by its tab, with
  Alt, or typed), whole-pixel positions anchored top-left.
- **Collision boxes as the engine uses them**: at the instance's top-left,
  never mirrored, whatever offset the Objects tab shows. Boxes overlapping in
  the play band, where `scene_collide()` runs, are shaded.
- **The camera view is the compositor, transcribed** from `scene_render()`
  and `obj_draw()`: bg fill, bands in order, `image_frame_at()` on the 16 ms
  tick, mirroring as a source-index swap, transparency by index. The editor
  and the camera view draw with the same function; bands hidden in the
  editor still show in the camera view, because the device draws them.
- **Checks**: the pool limit (255, a `uint8_t` capacity), same-band overlap,
  play-band collisions, instances outside the scene or off the screen,
  objects without a palette, box offsets. **Flash** is counted once per
  object however often it is placed; each instance is a pool slot (RAM).
- **Editing**: drag objects in from the list (or click to place at the
  camera's centre); drag to move, drag empty space to pan, wheel to zoom
  around the pointer; arrows nudge (Shift: 8 px), `[` `]` change band,
  Ctrl+D duplicates beside, Delete removes, Space plays. All of it undoes.
- **References stay whole**: deleting an object removes its instances (Undo
  restores both); re-importing an object keeps each instance's state by
  name; an instance whose state was deleted falls back to the first.

**How it was proven** (2026-09-29): a test scene built for coverage -- the
camera away from the origin, sprites clipped on every edge including negative
screen coordinates, overlap across and within bands, every flip, fixed and
hidden instances, four animation speeds -- was rendered by Canvas and by
the workbench engine's real `scene_render()` (compiled with gcc under
`-Werror`, the engine headers included in place). **All 4096 pixels were
identical at 0, 16, 96, 128, 240, 768, 1008 and 5008 ms**, and changing one
sprite's flip on the engine side alone made the test fail on exactly its
pixels.

**Phase 5 is built**: paths, a preview of movement. The engine has no
paths -- motion is game code, float positions and velocities in px/s -- so
nothing here is exported. What is kept is the engine's arithmetic:

- **Positions are floored** to whole pixels, as `rf_floor16()` does at draw,
  and time is sampled on the 16 ms display tick.
- **A state change restarts its animation; the same state does not**, as
  `obj_set_state()` is a no-op for the state already showing. So a walk
  cycle carries on across two walking segments and across the loop seam.
- **A path belongs to an instance** and starts where it stands; points are
  stored relative to it, so moving the instance moves its path.
- **Each segment has a duration, a state and a flip** (as placed / flipped /
  not flipped -- set explicitly, never guessed from the direction, since
  Canvas cannot know which way the art faces). Each shows its **speed in
  px/s**, the unit the game code will need. A wait is a segment that stays.
- **Curves are quadratic, travelled at constant speed** (by arc length). With
  equal steps of the curve parameter instead, a sprite would vary its speed
  by roughly ±50% around a bend, which reads as a glitch; measured along the
  curve, it stays within 1.5%.
- **Loop or once**, after an optional start delay; all paths run on the one
  scene clock (Pedro's choice over chaining one object's path to another's).
  A loop that does not end where it started jumps back, drawn dashed;
  "Back to start" walks it instead, at the path's pace.
- **Editing**: Add a path, then click to add points (a drag still pans);
  drag a square to move a point, a circle to bend a segment, double-click a
  circle to straighten; Delete removes the last point, Esc finishes. A new
  segment keeps the pace of the one before it. The toolbar has a **time
  scrubber** (dragging it pauses) and a toggle to show every path.
- **Checks**: segments shorter than the display tick, loops that jump,
  paths that leave the scene.

**How it was proven** (2026-09-29): the motion model against hand-worked
values -- floored positions, waits, per-segment flip, the animation restart
on a state change and its absence across the loop seam, the start delay,
once-and-hold. Editing through real pointer, key and double-click events. And
the compositor, now routed through the motion code, still matches the
workbench's `scene_render()` on phase 4's test scene: 0 pixels different at
all eight instants.

**Phase 6 is built**: `.aseprite` files read directly, and linked, so a
save in Aseprite shows up in Canvas within a second -- in the Scene too,
animated. This replaced the planned built-in editor as the next step: after
a brainstorm on 2026-09-29, Aseprite stays the drawing tool, and Canvas
removes the export round trip instead.

- **Link .aseprite…** asks for files with the browser's file picker (File
  System Access API: Chrome and Edge). Access is **read-only and limited to
  the files picked** -- agreed with Pedro, who keeps permissions minimal.
  Once a second, while the page is visible, Canvas asks each file only for
  its size and date, and reads it again when either changes. The handles are
  kept in IndexedDB; after a browser restart Chrome may ask once more, which
  is what **Reconnect** is for. Elsewhere (Firefox) the button falls back to
  a one-off import.
- **A reload is quiet** and stays on the tab you are on. If every colour is
  already in the palette, or the palette is the object's alone (new colours
  are appended; nothing moves), it just updates. **A new colour in a shared
  palette stops and asks** (Review…), because it would change other objects.
  A file caught half-written is retried; a moved file says so.
- **A state that keeps its name keeps its identity** across a re-import or a
  reload, so placed copies, their paths and the state on screen stay put.
- **The reader** is written from Aseprite's own specification
  (`docs/ase-file-specs.md` in the aseprite repository). It flattens the
  visible layers in Aseprite's order including cel z-index, honours layer and
  cel opacity with Aseprite's own integer blend, follows linked cels, reads
  RGBA, grayscale and indexed sprites (the transparent index, and the
  Background layer that has none), tags, durations, slices and **tilemap
  layers** (X/Y flips). Hidden layers, hidden groups and reference layers
  are left out, and say so. Blend modes other than Normal are drawn as
  Normal and **warned**.

**How it was proven** (2026-10-01): each file was exported by Aseprite itself
(`-b --sheet --data`) and compared with Canvas's direct reading, pixel by
pixel. All twelve `.aseprite` files in the fantoma repo -- **identical, every
RGBA pixel, state, duration and colour**. Five more written by Aseprite from
`scripts/aseprite_test_files.lua` for what Pedro's files do not use (layer
and cel opacity, a group, a hidden layer, z-index, a linked cel, indexed with
a Background layer, grayscale, a flipped tilemap, a multiply layer): all
identical except the multiply layer, which differs as warned. Two findings on
the way, both kept here because they would bite again:

- An **indexed** sprite exports as an indexed PNG, which has a single
  transparent index for the whole image -- so Aseprite's own export shows a
  Background layer's index 0 as clear. Compared against Aseprite's RGB
  conversion instead, the reader is exact.
- A browser canvas stores pixels **premultiplied**, so reading a PNG through
  one shifts partly transparent pixels by a unit or two (alpha 200: 90 became
  91). Decoded without premultiplying (Pillow), Aseprite's PNG and the reader
  agreed on every such pixel. The sheet import still reads PNGs through a
  canvas, so for art with partly transparent pixels **linking is the more
  exact route**.

The live link was tested with real file handles (the browser's private file
system) rewritten in place: reload on save, a new colour appended, the
shared-palette stop and Review, a half-written file, a deleted file, Unlink,
and the link surviving a page reload. **Reconnect after a browser restart
could not be automated** -- that private file system never asks for
permission -- so Pedro's first restart is its test.

**Phase 7 is built**: a **Tiles** tab. A tileset is drawn in Aseprite on a
**tilemap layer** over a **template** -- a picture of every place a tile can
stand -- and the template is the rule set: no rules are written by hand.

- **Rules by literal 8-neighbour reading.** Each template place's eight
  neighbours, filled or empty, are the situation its tile is for. Measured
  on Pedro's platformer template (2026-10-01): read literally, 50 places give
  44 situations and no conflicts; the common shortcut of ignoring a diagonal
  unless both sides beside it are filled gives six, and sides-only gives nine.
  His style uses diagonals on purpose, so the literal reading is the one used.
- **The template comes from a layer named `template`**, so a place with no
  tile yet is *not drawn yet* (hatched) rather than empty space. Without one,
  the placed tiles are the shape.
- **The Template view** is the numbered picture, made for you: each place
  shows its tile number. **Checks**: one situation drawn as two tiles (the
  16/24 kind of slip), places not drawn yet, tiles outside the template,
  identical tiles and tiles a few pixels apart (a stray pixel costs a whole
  tile of flash), unused tiles, flipped tiles.
- **The Level view** tiles a random level (platformer or caves, size and
  seed set in the panel) with the rules: the exact situation when drawn,
  else the closest one (a side neighbour weighs four times a diagonal),
  marked with a magenta corner. The **coverage report** lists each missing
  situation as a little 3×3 picture, how often the level has it, what stood
  in, and whether it is **planned** (a template place not drawn yet) or **not
  in the template** at all. Click a row to see where.
- **Linked like sprites**: Link tileset… reads the tilemap layer and its
  tileset directly and reloads on every save. Tiles are stored as palette
  indices, so palette edits carry them along, and a palette a tileset uses
  cannot be deleted.
- **New starter file…** writes an `.aseprite` file: the template (built-in
  platformer, or read from a picture of yours -- cell size found from where
  the ink starts and stops) as a locked layer, an empty tilemap layer over
  it, and an **editable tile size** (8 by default).
- **No export yet**: the engine has no tilemap (the workbench builds ground
  from one object per tile, and its pool holds at most 255), so the flash
  cost shown is what the tiles would cost as images. The format is for the
  engine session to settle first, as `image-format.md` was.

**How it was proven** (2026-10-01), on Pedro's `tileset_grass_set.aseprite`
(read from a copy, never written): the counts were worked out first in Python
-- 24 tiles of 8×8, 50 template places, 42 drawn, 8 not drawn yet, 38
situations, no conflicts -- and Canvas found exactly those, and the same tile
in every cell. Laid out by Canvas's own map, its tiles matched Aseprite's
render of the `tiles` layer on all 7168 pixels. The starter files Canvas
writes (8 and 12 px) were opened by Aseprite, which saw the right size, grid,
locked template and tilemap layer, let a tile be drawn and placed twice, and
saved -- and Canvas read that edited copy back correctly. Pedro's
`tileset_basic.png` read as a picture gives his 16×7 template at 25 px
cells, identical to the built-in one. The live link, palette moves (art
unchanged), the refusal to delete a used colour, the project round trip and
undo were checked in the browser.

**Phase 8 is built**: painting tiles in the Scene. What is painted is **where
ground is** -- a cell filled or not -- never which tile: the tileset's template
rules choose every tile, as in the level preview, so edges, corners and
diagonals follow the brush, and saving the tileset in Aseprite re-tiles all of
it.

- **Tile layers**: one tileset and one band each (default `play`), on a grid
  from the scene's top-left in that tileset's tile size. The grid follows the
  scene's size and the tile size; painted cells keep their place.
- **Tools**: Select / Paint / Erase in the Scene toolbar (V, B, E). A drag
  paints every cell it crosses, however fast; Shift-drag fills or erases a
  rectangle. One undo step per stroke.
- **Draw order**: within its band a tile layer draws **before** the band's
  objects. Where tiles sit in the engine's draw order is open -- it has no
  tilemap -- so this is the preview's answer until the engine session decides.
- **Scene edges**: by default ground continues past the scene's edge (painted
  along the bottom, it reads as a top surface with more ground below, not a
  thin bar); a layer can treat outside as empty instead.
- The camera view, collision boxes (solid ground in `play` is outlined), the
  checks (stand-in tiles; objects inside solid ground) and the flash table
  (tilesets counted once) all include tile layers. **Fill with a random
  level** gives a starting point.
- **Stand-ins** -- the little magenta corners -- mark cells whose situation has
  no tile drawn for it, so the closest drawn one stands in. The tile layer's
  panel lists them (planned, or a new shape) and outlines them on click.
  Editor only: the camera view never shows them.

Alongside (Pedro's requests, 2026-10-01):

- **Restart every N s** in the Scene toolbar: every animation and path starts
  over together at that time, as the ⟲ button does. Saved with the project.
- **The right panel can be dragged wider** by its left edge (260–640 px,
  double-click for 300), remembered on this machine.
- **Path segments** read short -- "→ 56,0", with length and speed at the end
  and the whole sentence in a tooltip. The rows had been laid out sideways and
  forced a horizontal scroll: the Tiles tab's segmented switch and the path
  segment rows both used the CSS class `seg`. The switch is now `segsw`, and
  no class is defined twice as a top-level rule (checked by script).

**How it was proven** (2026-10-01): the compositor was restructured to draw
tile layers band by band, so phase 4's engine comparison scene was rendered
again -- **0 pixels different from `scene_render()` at all eight instants**.
On Pedro's grass tileset, painted shapes took the template's tiles exactly (a
bar 1·2…2·3, a 3×2 block 14 15 16 / 18 19 20), the edge setting changed the
bottom row as described, an object in the same band drew over the tiles on
every overlapping pixel, a changed tileset re-tiled the painted ground, and a
fast stroke, a rectangle, erasing and undo were driven by real pointer and key
events.

**Phase 9 is built**: camera follow and parallax, as **experiments** -- Pedro's
reasoning (2026-10-02): if it does not work in Canvas it will not work better
on the panel, and Canvas iterates in seconds where the device needs a compile
and a flash. At 64×64 everything moves in whole-pixel steps; with a still
camera only sprites step, with a moving one the whole screen does, so how
evenly the steps arrive is what reads as smooth or jerky.

- **Follow** (Scene, left panel): the camera tracks a placed instance --
  **Locked** (centred every tick), **Dead zone** (moves only when the target
  leaves a central box, and only as far as needed) or **Dead zone + landing
  snap** (vertically it eases back to centre at 1 px a tick once the target
  has landed). The camera is simulated tick by tick from the start, always on
  a whole pixel (the engine's Camera is int16), clamped to the scene; the
  camera fields are its start. "Landed" means no vertical movement for two
  ticks *after moving down*: without the direction, the top of a jump --
  where floored positions hold one row for three ticks -- passed for a
  landing and the camera began re-centring on the apex (found by tracing).
- **Speed against the tick**: a followed object's segment speeds are checked
  -- 50 px/s is a pixel every 1.25 ticks and steps unevenly, 62.5 px/s is one
  a tick, 31.25 one every two. With a following camera that unevenness is the
  whole screen's.
- **Parallax (a proposal)**: a factor per band, x and y.
  `screen x = floor(x) - floor(camera x × factor)` gives exactly today's
  behaviour for factor 1 and for 0 (what `OBJ_FIXED` does). Each band shows
  its step pattern (1/2 steps `0·1·0·1`, 0.3 steps `0·0·0·1·0·0` -- warned) and
  how much of it can ever be seen, so a slow backdrop is drawn wide enough and
  no wider. Tile layers, painting and path handles follow their band's shift.
- The camera view now sizes itself from the panel (whole-number scale), so
  widening the right panel enlarges it: 4× at the default width, 9× at 640 px.

**How it was proven** (2026-10-02): with follow off and every factor 1, phase
4's engine comparison scene matched `scene_render()` with **0 pixels
different**. Against hand-worked numbers: a hero at 50 px/s put the locked
camera at 60 and the dead-zone camera at 49 at 1.6 s, and never left the dead
zone in 251 ticks; landing snap rose 4 px for a 16 px jump, held at the apex,
and eased back a pixel a tick, and on a hop to a higher ledge settled centred
on it; a backdrop cloud at 1/2 with the camera at 60 drew all 64 pixels at
screen x 10, a tile in a 1/2 band all 60 of its pixels at x 50; painting in a
shifted band hit the intended cell. Every tab's right panel fits at 260, 300
and 640 px.

**Tile situations, counted in 47** (2026-10-03). Eight neighbours make 256
patterns, but only 47 can look different: a diagonal neighbour matters only
when both sides beside it are filled -- otherwise that corner is an open edge
anyway. Repeating a tile in a situation the template already has teaches the
rules nothing; covering more situations does. So:

- **Lookup order**: a tile drawn for the exact pattern; else one drawn for a
  pattern that is the same situation counted the 47 way (no magenta corner:
  it is not a stand-in); else the closest situation, now measured the 47 way
  so a diagonal that cannot show costs nothing. The exact pattern still comes
  first because a template may tell diagonals apart on purpose: the brick
  platformer does (6 conflicts if reduced), and the grass file draws lone
  tiles four ways by their diagonal neighbours. The Checks list such
  situations as information, not conflicts.
- **Coverage**: the Tiles tab's Checks show the 47 as small pictures --
  drawn (green), planned in the template (amber), not in the template
  (faded) -- and "N of 47". The stand-in tables group by situation.
- **Starter**: "All 47 situations" is now the default template: 73 places in
  11 × 10 with every situation at least once (found by a search -- not proven
  the smallest). Where a situation repeats, place the tile already drawn.
  The dialog says how many of the 47 any template, including one from a
  picture, has places for.

**How it was proven** (2026-10-03): the rule functions were lifted from the
page and run outside the browser on the grass file's template (dumped
read-only): 39 patterns, 0 conflicts, **22 of 47** situations drawn, 1 more
planned (the starter platformer layout holds 23 of 47 even fully drawn). On
120 random levels, all 16,018 cells tiled exactly before are unchanged; of
7,582 stand-ins, 5,130 are now the same situation, 306 of them with a better
tile -- e.g. a top-right corner with ground to the south-west was given tile
9 (drawn for an *empty* south-west, picked by a tie) and now gets 16, the
plain corner. The 47 template filled with one tile per situation tiled
42,706 random-level cells with 0 stand-ins and 0 wrong tiles.

**Catalogue templates** (2026-10-03). A neighbour template has to place
every tile among exactly the right neighbours (hence the odd 73-place blob).
A **catalogue** labels each tile instead, so the places can sit anywhere --
Pedro's 47-tile sheet is a checkerboard of numbered cells. The markings: a
strip along a side means that side is **open** (the ground ends there); a
block in a corner whose two sides are closed means an **inner notch**; no
markings at all is the interior tile, ground all round.

- A layer named **`catalogue`** is read by its markings; a layer named
  `template` keeps the neighbour reading (and Canvas says so if it looks
  marked). A marking is any colour other than the cell's fill, which is
  taken from the cell's inner square, so a wide strip or a number in the
  middle does not fool it. Each side is sampled at three points: a side with
  only one or two marked is reported as unclear. Two places with the same
  markings are reported too.
- **Starter from a picture**: a picture whose cells carry different markings
  is read as a catalogue. The file written has the markings redrawn at the
  tile size on `catalogue` (locked), the picture itself as a **reference
  layer** `numbers` scaled exactly onto the grid (Aseprite's precise cel
  bounds), and an empty `tiles` tilemap. Draw each tile once, over its number.
- The Tiles tab shows a catalogue's markings under places not drawn yet.

**How it was proven** (2026-10-03, outside the browser, with the page's own
functions run under Node): Pedro's sheet (500 × 125, 25 px cells) read as
47 places, 47 different situations covering all 47, none unclear; tile 6 is
the top-left corner, 14 the four-notch cross, 47 the interior. The starters
written at 8 and 16 px were opened by Aseprite 1.3.17 (`catalogue` locked,
`numbers` a reference layer, its 500 × 125 picture shown at 160 × 40, an 8 px
tilemap) and saved again by it; Canvas read its own files and Aseprite's
copies back with identical situations. Aseprite then drew a distinct tile at
each numbered place: Canvas read 47 rules, 0 conflicts, 47 of 47, and tiled
42,706 random-level cells with 0 stand-ins and none given a tile labelled
for another situation. The grass file reads identically to before (11,800
level cells unchanged) and the plain starter's bytes are unchanged.

Next: the palette draft-and-promote workflow, then a particle explorer. Open
for tiles: a depth rule ("top lit, fading to black below" needs more than one
tile of context) and the engine's tilemap format, including where tiles draw
within a band. Open for the engine: whether to adopt parallax factors and
which camera behaviour, once tried here and on the panel.

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
   **`id`** (to `/fantoma-tools/tools/<tool-id>/` — a copied `id` makes Chrome
   think the new tool *is* the old one), `name`, `short_name`, `description`,
   `theme_color`, and `SW_CACHE`.
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

   That one call registers the service worker, requests persistent storage,
   appends the standard Export / Import / Install panel, and adds the
   **← Fantoma Tools** link. The link goes at the top of `.wrap` if the page
   has one, otherwise the top of `<body>`; pass `hubLinkInto: someElement` if
   neither suits the layout.
5. Add a tile to `index.html` (the hub tags it with `#from-hub` automatically),
   and add the tool's files to its `SW_ASSETS`.

---

## Local development

```bash
python -m http.server 8765 --directory fantoma-tools
```

Then open `http://localhost:8765/`. Service workers need HTTPS *or* localhost,
so opening the files directly with `file://` will work for the tool itself but
skips all the offline machinery.
