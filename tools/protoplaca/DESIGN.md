# Protoplaca — design

A tool for replacing a breadboard with a printed plate.

You draw a 2D scaffold: a plate outline, the components that stand on it, the
wires between them. From that the tool produces an STL — the plate, the bosses
the components screw onto, the retainers that hold each wire on its path, ribs,
and any text. You print it, screw the parts down, press the wires in, and the
prototype stops being a pile of jumpers that falls apart when you move it.

**Protoplaca is not part of Fantoma.** It lives in this repo because this is
where the tools live, and it appears on the hub like the others. It shares the
shell conventions — one static page, no build step, the storage layer, the
service worker — and nothing else. It must never reach into `fantoma/python/case`,
`case_params.py`, or any arcade-specific geometry. If it ever needs to, that is a
sign the feature belongs in Fantoma rather than here.

---

## Units and coordinates

**Millimetres everywhere. No other unit is offered.**

**Origin at the bottom-left of the plate. X to the right, Y up and away, Z up out
of the plate.**

This is the modelling convention rather than the screen convention, and it was
chosen deliberately. The alternative — 0,0 at the top-left with Y increasing
downward, as a canvas naturally works — means every coordinate has to be flipped
on the way to the mesh, and a sign error there produces a mirrored part that looks
perfectly correct on screen and is only discovered after a print. With the
modelling convention the 2D editor *is* the XY plane seen from above. There is no
mapping to get wrong. The canvas flips Y once in the drawing layer, and nowhere
else in the program.

**Decimal point, never a comma**, in both languages. Confirmed preference; it also
removes any parsing ambiguity in numeric fields.

---

## Phases

Phase 1 is the smallest thing that is genuinely useful: it answers "where do I
screw the ESP32 down" without any wire handling at all.

**Phase 1 — plate, components, bosses, STL** (steps 1 and 2 are built)

1. Canvas: grid, rulers, pan and zoom, guidelines, plate outline (rectangle
   first), live mm readouts. Nothing saved yet.
2. Components and the file format: place, move, resize, name, colour, the three
   heights. Save and load the project file. *The format lands this early on
   purpose* — everything after it is then a schema addition rather than a
   migration.
3. Bosses: size, fixing type, height, numeric placement.
4. STL out: slab plus boss tubes. Export. Print the calibration coupon.

**Phase 2** — wires: drawing, anchoring, colours, names, AWG, length readout.
**Phase 3** — retainers: auto-placement, tunnels and clips, crossings.
**Phase 4** — the 3D tab: the mesh plus coloured wires and components, collision
checks.
**Phase 5** — ribs, recessed text.

---

## The document

One JSON object. Schema sketch, not final:

```jsonc
{
  "format": "protoplaca",
  "version": 1,
  "units": "mm",
  "name": "ESP32 test rig",   // what the project is called, and its filename
  "profile":   { /* print profile — see below */ },
  "plate":     { "w": 120, "h": 80, "thickness": 3 },
  "components": [ {
      "id": "c1",
      "name": "ESP32 DevKit v1",
      "at": [12, 44],         // bottom-left corner, in plate coordinates
      "size": [52, 28],
      "colour": "#4dd8ff",
      "standoff": 6,          // clear space beneath the board
      "board": 1.6,           // board thickness
      "body": 12              // height above the board, for the 3D view
  } ],
  "bosses":    [ { "id": "b1", "at": [0,0], "size": "M3",
                   "fixing": "selftap",    // or "insert", "clearance"
                   "height": 6 } ],
  "wires":     [ { "id": "w1", "name": "SDA", "colour": "#e33", "awg": 24,
                   "od": 1.6,              // AWG only supplies the default
                   "path": [ /* anchors and free points */ ],
                   "slack": 20 } ],
  "retainers": [ { "id": "r1", "wire": "w1", "t": 0.42,
                   "kind": "tunnel",       // or "clip"
                   "origin": "auto",       // or "manual", "auto-suppressed"
                   "level": 0 } ],
  "ribs":      [ { "path": [[0,0]], "width": 2, "height": 5 } ],
  "texts":     [ { "at": [0,0], "text": "5V", "size": 6, "depth": 0.6 } ]
}
```

### Shape: a bounding box now, an outline later

A component carries `at` and `size` — where its bottom-left corner is, and how
big it is. That is the whole shape today, and every part is a rectangle.

**This is staging, not a decision that components are rectangles.** The original
sketch said `outline` for a reason worth keeping: plenty of real parts are
rectangles with something taken out of them — a notch, a cutout, a corner
clipped off a board — and a bounding box cannot say so. A shape you can only
approximate is a shape you will mis-measure against later, which is exactly the
failure this tool exists to prevent.

The path there, when it is worth taking:

- `at` and `size` stay, and keep meaning what they mean: placement, and the
  extent the grid snaps and the resize handles move. They become the bounding
  box rather than the shape.
- An optional `outline` is added, in component-local millimetres with 0,0 at
  the component's own bottom-left. A component without one is the rectangle its
  bounding box describes — so nothing already saved changes meaning, and the
  common case still needs no polygon.
- Editing an outline needs its own interface (add, drag and remove vertices),
  which is the real cost and the real reason it is not in this step.

**Surface detail is further out still and is explicitly cosmetic** — a
ventilation grille, a speaker's hole pattern, silkscreen — drawn on a component
so you recognise it at a glance rather than reading its label. Worth having
eventually, worth nothing until the parts themselves are right, and it must
never affect the generated geometry.

Rotation is the same shape of problem: one more field on a component when it
arrives, not a change to what is already written.

### Why the panel asks for numbers, not shapes

Whatever the format can express, the editor's fast path stays typing. You
arrive at a component by putting calipers on a real part and reading off a
width and a height. That is true whether the component is a plain rectangle or
a rectangle with a notch, so the numeric fields are the primary way in and any
outline editing sits on top of them.

### Unknown fields survive a load

A file carrying sections this build has never heard of — `bosses`, written by
a later version — keeps them. They are read in, left untouched, and written
back out. A file's version number is kept as its own, not rewritten down to
ours, because the parts we did not understand are still in there and calling
the result version 1 would be a lie.

The alternative is that merely opening a project in an older build quietly
destroys part of it, which is the kind of data loss nobody notices until it
matters.

### What is not in the file

The **grid pitch** is how you are working, not what you designed, so it is a
preference of the browser. Two people opening the same project should each get
the grid they think in, and the file should not record that one of them likes
2.54 mm.

**The STL is not in the file.** It is fully determined by the document plus the
print profile, and it regenerates in milliseconds on load. Storing it would mean
the file could one day hold a mesh that no longer matches the diagram sitting next
to it — and at that point you have to guess which one is right. Same discipline as
Model Viewer, where the web page holds no dimensions of its own.

Saved as `.protoplaca.json`. A custom extension would look tidier, but the double
extension means the file opens in any editor, is obviously readable, and needs no
MIME negotiation from a static host.

### Two kinds of saving

- **Automatic**, into the browser store, so closing the tab does not lose work.
  This is what the other tools do, and the shared Export / Import backup panel
  already covers it.
- **Explicit**, as a downloaded `.protoplaca.json`, because a project is a
  document you will want to keep, copy to another machine, and version.

Both. They are not alternatives: the store is a safety net, the file is the
artefact.

### Undo

Ctrl+Z and Ctrl+Y, as whole-document snapshots — the document is small enough
that a snapshot is just its JSON, so this needs no inverse operations and has
no bugs of its own.

It is here because the tool saves as you work. Without autosave, a mistake
costs nothing: you close without saving. With it, the previous state is already
overwritten by the time you notice, so undo is not a convenience, it is the
only way back. Autosave and undo arrived in the same step for that reason.

### The print profile

Nozzle diameter, the clearance around a wire in a retainer, boss wall thickness,
and the hole diameter per screw size and fixing type. These live in the document
so a project regenerates faithfully, but they are also kept as a default set,
because they are properties of *your printer and your filament* rather than of any
one design — and once the coupon has told you what they are, you should never have
to type them again.

---

## Editor rules

**Grid.** 1 mm default, 2.54 mm optional, and a numeric entry box that overrides
the snap entirely. 2.54 mm is 0.1 inch — the pin spacing of headers, DIP parts,
breadboard and perfboard — so anything descending from that geometry lands exactly
on it instead of accumulating rounding down a row. But since there is no footprint
library, boss positions come from calipers and are arbitrary numbers that no grid
snaps to. The grid lays things out roughly; the measured number gets typed in. The
tool proposes, the caliper decides.

**Guidelines, rulers on both axes, a live dimension readout while dragging, and a
measure tool between two points.** With no shipped footprints these are the
precision instruments, so they are not decoration.

**No shipped component library.** We would be shipping datasheet numbers we have
not verified, and in this project datasheet numbers have been wrong often enough
to be a running theme — a joystick that was not centred on its own mounting holes,
a button cap measured at the wrong end. What ships instead is the ability to **save
a component you have measured** as reusable, in your own storage. Not a library:
your measurements, which are the only ones either of us trusts.

**Components stand on bosses.** Hence three heights rather than one, and hence
wires may legally pass *underneath* a component in plan view. That also gives the
tool a real check to make: does this wire, plus the retainer over it, fit in the
standoff clearance? That is an error worth catching in the editor rather than after
a print.

**Wire anchoring.** Starting or ending a wire near a component snaps the endpoint
to the nearest point on that component's outline, stored as a position along the
edge — so moving or resizing the component drags the wire end with it rather than
stranding it.

**Wire length must be honest.** Reported as a breakdown: flat path, plus the climb
over each retainer, plus the standoff climb at each end, plus the slack allowance.
The whole point of the readout is to tell you which jumper to reach for, or how
many to chain. A readout that says 17 cm when you actually need 20 cm is worse than
no readout at all, because you will cut to it.

**Auto-placed retainers must respect manual edits.** Each retainer records whether
it was placed automatically or by hand, and a deleted automatic one is remembered
as suppressed rather than forgotten. Otherwise pressing *auto* a second time
silently undoes your corrections. Cheap now, painful to retrofit.

---

## Retainers: tunnels and clips

A **tunnel** is closed — the wire threads through it and cannot come out. A **clip**
is an open C that the wire presses down into, and can be pulled back out of.
Tunnels hold better; clips are serviceable.

**Tunnels are the default, clips are a per-retainer override** — except at the ends
of a wire, where the default inverts. Here is why:

A tunnel sized for a 24 AWG wire has roughly a 2 mm bore. A crimped Dupont
connector is around 2.5 × 6 mm in its housing. **It will not pass through.** So a
ready-made jumper cannot be threaded through a closed tunnel at all, and sizing
every tunnel to pass a connector would make them enormous for no benefit along the
middle of a run.

So the auto rule is: **the first and last retainer on each wire is a clip, and
everything between them is a tunnel.** You press the connector ends into clips and
thread only the bare middle of the wire. Permanence where the wire is merely
passing through, serviceability exactly where you unplug things.

**Roof shape is a parameter, not an argument.** A square tunnel's roof is a flat
unsupported bridge; FDM manages a few millimetres of that, but the underside comes
out rough and may sag slightly, which eats the clearance the tool calculated. An
arch with a pointed apex never exceeds roughly 45° of overhang, so nothing is
bridged and nothing sags. Both probably work at these sizes. The coupon settles it
in ten minutes, which is cheaper than either of us being sure.

**Wire size.** AWG fixes the conductor diameter, but the insulated outside diameter
varies a great deal with the jacket — silicone-jacketed 24 AWG is noticeably fatter
than PVC-jacketed 24 AWG. So AWG supplies a default OD and the OD stays editable per
wire. The retainer bore is OD plus the profile's clearance.

**Crossings.** Where wire A passes over wire B, the upper retainer's height is
clearance + B's OD + wall, and B wants pinning down close to the crossing so it
cannot wander out from under. The tool proposes which wire goes on top and you can
flip it with a click. Automatic layering is a graph problem with no single right
answer, and the final say is yours regardless.

---

## Geometry

**No CAD kernel, and no boolean operations.**

Everything Protoplaca produces is a prism or a swept profile standing on a flat
plate: the slab, tubular bosses, rib walls, retainers swept along a path. A boss
with a hole is generated *as a tube* rather than as a cylinder minus a cylinder, so
nothing needs subtracting. Slicers accept overlapping closed volumes in one file and
union them at slice time, so the parts do not even need merging. That is a few
hundred lines of plain JavaScript emitting triangles — no WASM kernel, no build
step, one HTML page, consistent with every other tool here.

The single exception is **recessed text**, which genuinely is a hole in the plate's
top face. That is a polygon-with-holes triangulation: glyph outlines from a font,
holes punched in the top face, plus recess walls and a floor. Solvable with a small
triangulation library and still no CSG. It is also phase 5, so if the approach is
going to break, it breaks last and cheaply.

The consequence, accepted knowingly: **Protoplaca shares no geometry code with
`fantoma/python/case`**, which is build123d on OpenCascade. That is real
duplication. It is the right call because Protoplaca is a general tool that must run
in a browser with no install, and the case CAD is one specific part built in Python
— but it is a choice, not an oversight.

---

## Output

**STL** for compatibility — universally accepted, carries no units, and every slicer
assumes mm, which is what we emit.

**3MF** as well, because it carries units explicitly and supports per-object colour,
so component and wire colours can survive into the slicer instead of arriving as an
anonymous grey blob.

---

## The calibration coupon

**An option in the tool, not a mandatory first step.** A small plate carrying one
boss of each size in each fixing type, and a few retainers — tunnel and clip, square
and arched roof — at a couple of wire sizes.

One print tells you: the self-tap hole diameter that actually grips in your
filament, the hole that actually takes your heat-set inserts, whether a square roof
sags enough to matter, and whether a clip holds a 24 AWG wire without letting go.
Those measured numbers become your print profile defaults — arrived at with calipers
rather than inferred from a table.

It stays available rather than being a one-time wizard, because it is worth
reprinting when the filament, the nozzle, or the printer changes. Once you know your
numbers you will stop reaching for it, and that is fine — the point is that the
numbers came from a measurement the first time.

---

## Language

**English and European Portuguese**, and Protoplaca is the first tool here to be
bilingual. Every user-visible string lives in one catalogue from the first commit;
none are written inline in the markup. Retrofitting that is miserable, and the cost
of doing it from the start is close to zero.

Portuguese here means European Portuguese, not Brazilian.

---

## Interface, planned but not built

Raised while using the first working build, and worth having. None of it
changes the document or the geometry — it is all about getting at the tool.

**A toolbar above the drawing, icons with tooltips.** The panels beside the
canvas are for typing numbers; the things you reach for while drawing belong
above the drawing, where taking them does not cost you sight of it.

What goes on it:

- **Measure**, as a toggle — moved off the View panel.
- **Clear guides**, as a push button — likewise.
- **Cursor readout**, as a toggle. Dashed lines from the pointer to both axes
  and the coordinate in text beside it, `(17.32, 15.14)`, while the pointer is
  over the drawing. The status bar already carries the numbers; this puts them
  where the eye already is.
- **Component dimensions**, as a toggle. Each component's size and origin shown
  under its name, when there is room for them.

**A default colour palette for components**, with a custom colour still
available. Picking from a handful is less work than deciding a hex value, and
Model Viewer already establishes the pattern in this repo. The palette itself
is not chosen yet.

---

## Deferred, deliberately

- **Non-rectangular plate outlines.** Rectangle in phase 1; arbitrary polygons once
  the rest works.
- **Plates larger than the build volume.** The editor should warn when the plate
  exceeds the profile's build volume. Splitting a large plate into joined tiles is a
  separate feature and not currently planned.
- **Junctions.** Wires run point to point. Where three wires must meet, that is a
  component — a terminal block — not a wire feature.
- **Lightening and ventilation holes** in the plate.
