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

**Phase 1 — plate, components, bosses, STL** (built)

1. Canvas: grid, rulers, pan and zoom, guidelines, plate outline (rectangle
   first), live mm readouts. Nothing saved yet.
2. Components and the file format: place, move, resize, name, colour, the three
   heights. Save and load the project file. *The format lands this early on
   purpose* — everything after it is then a schema addition rather than a
   migration.
3. Bosses: size, fixing type, height, numeric placement.
4. STL out: slab plus boss tubes. Export. Print the calibration coupon.

**Phase 2** — wires: drawing, anchoring, colours, names, AWG, length readout.
(built)
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
                   "slack": 20,
                   "path": [               // plate coordinates, not local ones
                     { "at": [30, 44], "of": "c1" },   // attached to a board
                     { "at": [30, 34] },               // free corner
                     { "at": [80, 40], "of": "c2" }
                   ] } ],
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

### Wires

A path of points in plate coordinates, each optionally carrying `of`: the
component that end is attached to.

**World coordinates, not component-local offsets.** An anchored point then
travels with its component exactly as a boss does — one pattern in the file
rather than two — and a point whose component has been deleted stops following
anything while staying exactly where it stood. With local offsets it would have
jumped to wherever the offset happened to land, which is the sort of silent
damage you only notice after printing.

**Angle snapping while drawing.** The next point is pulled onto a horizontal, a
vertical or a 45° diagonal from the point before it, because that is what tidy
wiring looks like and because a run one degree off square is invisible on screen
and obvious on the plate. The angle is checked *before* the grid and the result
re-snapped along the locked axis; doing it the other way round lets the grid pull
a point a fraction off the line it was just locked to.

**Drawn at true insulated width.** Not decoration: six 24 AWG wires are 8.4 mm of
jacket side by side, and seeing that they will not fit through a gap is the
reason to draw the plan before building it.

**AWG supplies a default outside diameter and nothing more.** The gauge fixes the
conductor; the jacket decides the outside, and silicone 24 AWG is appreciably
fatter than PVC 24 AWG. The shipped defaults are typical PVC hookup wire —
assumed, not measured — and the OD stays editable per wire. Changing the gauge
offers its default; typing a diameter keeps what you typed.

### The length readout, and what it does not yet include

Reported as its parts, never as one number: **flat run**, **standoff climbs**,
**slack**, then the total. The point of it is to tell you which jumper to reach
for, and a total you cannot see inside is a total you cannot check.

It is labelled *at least*, and it means it. **The climbs over retainers are not
in it**, because retainers do not exist yet; they arrive in phase 3 and can only
add. This is stated in the panel rather than left to be discovered, because a
readout that quietly under-reports is worse than no readout: you would cut to it.

### Bosses, and what they belong to

A boss can hold a component down, and says so: `of` carries that component's
id, or null for a free-standing boss. Two things follow from the relationship,
and both are the reason it exists.

**Its bosses travel with a component.** Move the ESP32 and the four bosses
under it move too. They are its mounting holes; leaving them behind would mean
re-placing them by hand every time the layout changes, which is exactly the
work this tool is supposed to remove.

**Its height is the component's standoff.** These are not two numbers that
ought to agree — they are one measurement written down twice. The standoff is
the clear space under the board; the boss is what holds the board up there. If
they differ, the board sits crooked or does not sit at all. So an attached boss
takes the component's standoff and shows the field as not editable; detach it
and it keeps a height of its own. The value is still written into the file
either way, so the document stays self-contained and the mesh generator never
has to chase a reference to find a height.

Deleting a component does not delete its bosses. It clears their `of` and
leaves them standing, because the holes are still in the plate you are about to
print. A boss whose `of` points at a component that is not in the file is not a
reference, and is read back as free-standing.

**The boss's outer diameter is not stored.** It is the hole plus twice the wall
thickness, both from the print profile. A boss that carried its own outer size
could disagree with the profile, and then the drawing and the mesh would be
describing different objects.

### Every number says where it came from

Each hole diameter carries one of three states, and **the tool never promotes
between them on its own**:

| | |
|---|---|
| **measured** | confirmed on a real print, on the machine named in the profile |
| **standard** | an ISO tapping or clearance size — a table, not a measurement |
| **assumed** | extrapolated or invented, because nothing better was to hand |

This follows the convention already used in `print_tests/TESTS.md` and
`case_params.py`, and for the same stated reason: *a guess is never promoted to
a measurement without measuring.* So **editing a hole does not mark it
measured** — you might be trying a value rather than reporting one. Promotion
is a separate, deliberate button. Unmarking returns a number to whatever the
shipped default said it was, rather than to a fourth state meaning "was
measured once".

**What is measured, and by whom.** M2 self-tap at 1.6 mm and M3 at 2.5 mm come
from T2 in `print_tests`: a five-value sweep either side of each, every one of
which took its screw without stripping or splitting at 2–3 mm of engagement.
Everything else ships as standard or assumed.

**The profile names the machine it describes**, because these numbers are not
properties of the design. T2 makes that unarguable: the same 1.6 mm pilot in
the same drawing measured **0.925 mm** under one slicer profile and **1.580 mm**
under another — 71 % wider, from settings alone, with roundness improving by an
order of magnitude alongside it. A hole diameter without the profile that
produced it is not a measurement, it is an anecdote.

### The smallest hole that prints round

`minHole`, default **1.5 mm**, measured. Below it a hole stops being round
rather than merely being small: at 1.0 mm nominal the measured result was
0.18 mm out of round — 18 % of nominal — against 0.01–0.07 mm everywhere from
1.5 to 4.0 mm.

Two of the shipped self-tap defaults fall under it: **M1.4 at 1.1 mm and M1.7
at 1.35 mm**. The tool says so on the boss and again before export, rather than
letting a number that cannot be printed sit in a table looking like the others.
Below the floor the advice is to model generously and drill, or to use a
clearance hole and a nut.

### Shrinkage is not uniform, and that matters later

Through-holes in a 3 mm plate lost **0.168 mm ± 0.020** — essentially constant
regardless of diameter, so the error is absolute rather than proportional,
which is why it costs an M2 far more of its thread engagement than an M3.

But a blind pilot inside a boss lost only **0.02 mm**. Same plate, same hour,
same profile. The shrinkage is therefore not a global property of the machine,
which is exactly why `xy_hole_compensation` is left at 0 there — a global
correction would take the boss pilots to 1.75 and 1.89 and make loose screws of
the one feature that works.

**Every hole Protoplaca currently makes is blind**, so the table values are
right as drawn. The moment clearance holes go through the plate they will need
drawing oversize by roughly the through-hole shortfall. That is a measured
design input already waiting for the triangulator.

### Other findings carried in from the same tests

- **Boss outer diameter = pilot + 4 mm**, which is the 2 mm wall default. T2
  printed its bosses to that rule and none split.
- **Boss height has no measurable effect** on how a boss behaves, so the height
  field needs no printing constraint.
- **Maximum unsupported bridge: 20 mm**, and 20 is the edge rather than a
  comfortable limit. That is the design rule for a square tunnel roof in phase 3.
- **Minimum structural rib: 1.0 mm**, design at 1.2. What failed below that was
  not the rib printing but the rib staying attached to the plate. Phase 5.
- **Minimum engraved groove: 0.4 mm**, the smallest tested. Phase 5, recessed
  text.

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

**STL**, binary. Universally accepted, carries no units, and every slicer assumes
millimetres — which is what we emit. Binary rather than ASCII because ASCII is
roughly five times the size for the same geometry and no more readable once it is
past a few thousand facets.

**3MF is deferred, and the earlier reasoning for it was wrong.** It was justified
here on two grounds: explicit units, and per-object colour so component and wire
colours survive into the slicer. The second does not apply and will not for some
time — **nothing in the printed object has a colour.** The plate, the bosses, the
retainers and the ribs are one part in one material; the colours belong to
components and wires, which are drawing annotations and are never printed. That
leaves explicit units as the only live advantage, over a format where every
slicer already assumes the right ones.

It earns its place when there is something to colour — multi-material, or
components exported as reference bodies to check a fit — and not before.

## The mesh

Built from prisms, with no boolean operations, exactly as the geometry section
above describes: the plate is a box, and each boss is generated **as a tube**
rather than as a cylinder with a cylinder subtracted from it. Overlapping closed
volumes go into one file and the slicer unions them.

Bosses are sunk 0.2 mm into the plate rather than resting exactly on it.
Coincident coplanar faces are a classic source of slicer artefacts, and a little
overlap makes the union unambiguous. The boss still stands its full height proud
of the plate, which is the number that matters.

### Holes are blind, and clearance bosses are not done

A tube standing on a solid slab gives a **blind** hole. That is correct for
self-tapping screws and for heat-set inserts: the screw stops inside the boss and
nothing protrudes underneath.

A **clearance** hole is different. The screw has to pass through and take a nut,
so the plate itself needs a hole — which means the slab's top and bottom faces
stop being rectangles and become rectangles-with-holes. That needs
polygon-with-holes triangulation, which is the single exception this design
already identified, and which recessed text needs too.

So clearance holes and recessed text are the same problem, and they get one
triangulator, built once and tested once. The alternative was a special case for
circular holes in a rectangle — split the plate into cells holding one hole each
and zip each hole to its cell — which would work and would be thrown away the
moment the real triangulator arrived. A subtly wrong triangulation produces a
mesh that slices wrong, which is the failure this project can least afford to
have two implementations of.

Until then the export panel says plainly that clearance bosses come out blind.
The tool is allowed to be incomplete; it is not allowed to be quietly wrong.

### The mesh is checked before it is written

Every edge of a closed surface is shared by exactly two triangles which traverse
it in opposite directions — so each *directed* edge must appear exactly once
across the whole file. That single count catches holes in the surface, flipped
winding and duplicated faces, which are the three ways a generated mesh goes
wrong. Overlapping solids are fine: each is closed on its own, so the union still
balances.

It runs before every export, and a mesh that fails is **not written**. A broken
mesh found on the printer costs an hour and a spool; found here it costs nothing.

It paid for itself immediately: the first tube came out with both of its annulus
faces wound backwards, which no amount of looking at the drawing would have
shown.

---

## The calibration coupon

**An option in the tool, not a mandatory first step.** A small plate carrying one
boss of each size in each fixing type — and, once retainers exist, a few of those
too: tunnel and clip, square and arched roof, at a couple of wire sizes.

**It is an ordinary project, not a special export path.** Pressing the button
builds a document and opens it in the editor like any other. Two things follow.
It exercises the same geometry as everything else, so it tests what you will
actually print rather than a parallel implementation that could drift. And the
editor is its legend: clicking a boss tells you which size and fixing it is,
which is what lets the coupon be useful before there is any way to emboss a
label on a plate.

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

## Interface

Raised while using the first working build, and worth having. None of it
changes the document or the geometry — it is all about getting at the tool,
and none of it is load-bearing: the canvas measures its own box every frame, so
a toolbar can be dropped in above it without the drawing code noticing, and the
buttons bind by id so moving them is moving markup.

**A toolbar above the drawing, icons with tooltips** — **built**. The panels
beside the canvas are for typing numbers; the things you reach for while drawing
belong above the drawing, where taking them does not cost you sight of it.

On it: Fit, Cursor readout, Dimensions, Align bosses, Measure, Clear guides.
The View panel keeps only the grid pitch, which is a choice rather than an
action.

Its buttons hold an SVG, so their label is the tooltip — `applyLang` sets
`title` rather than `textContent`, because writing text into them would throw
the icon away. That is the second time this trap has been hit here; the panel
headings hit it with their chevron.

- **Measure**, as a toggle — moved off the View panel. Built.
- **Clear guides**, as a push button — likewise. Built.
- **Cursor readout** — **built**, though it lives on the View panel until
  there is a toolbar to move it to. Dashed crosshair, a mark on each ruler, and
  the coordinate beside the pointer. It was pulled forward because it is not
  really a new feature: the X/Y readout had the same flaw the measure tool did
  — a strip below the canvas is not where you are looking — and with no
  component library the coordinate readout is how parts get placed, so it is
  the number read most often. On by default; the status bar keeps its copy,
  which is always visible and does not need the pointer to be over the drawing.
- **Component dimensions**, as a toggle — **built**. Each component's size and
  origin under its name, and each boss's screw size and fixing under the ring,
  when there is honestly room: a label that overflows its own component onto its
  neighbour is worse than no label, so they are dropped rather than crammed.

  Extending it to bosses was not in the original suggestion, and it turned out
  to be the bigger win. **It is what makes the calibration coupon readable.**
  Eighteen near-identical rings become a labelled grid, which is what lets the
  coupon work before there is any way to emboss text on a plate.

### Aligning bosses

Dragging a boss snaps it onto the centre line of another boss **holding the same
component**, and draws a ruler between them with the centre-to-centre distance.

The `of` restriction is the whole idea. Mounting holes on one board are a
pattern — a rectangle, a row — so a new hole almost always shares an X or a Y
with one already placed. Holes under a different component share nothing, and
letting them attract each other would be noise. Free-standing bosses form their
own group, since scattered ones still want to line up.

Four things it has to get right, each of which would make the feature useless on
its own:

- **The tolerance is in screen pixels**, converted to millimetres at the current
  zoom. Fixed in mm it would feel sticky zoomed in and be unreachable zoomed out.
- **Alignment beats the grid.** Landing on a sibling's X only for a 1 mm grid to
  pull you straight off it again would defeat the point, so when both apply the
  grid stands aside.
- **The axes are independent.** The fourth hole of a four-hole rectangle lines up
  with one sibling across and a different one down. Both snap, and both say so.
- **Typing a number bypasses all of it.** A coordinate you read off calipers is
  the one number the tool must never quietly adjust.

The distance readout is the part that earns its keep beyond tidiness: it is the
hole spacing, which is the measurement you took from the real part.

Not done, and worth considering later: equal-spacing snapping for a third hole
in a row, and the same treatment for components against each other.

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
