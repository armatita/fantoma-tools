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
**Phase 3** — retainers: tunnels, clips, automatic placement and crossings.
(built)
**Phase 4** — the 3D tab: the mesh plus coloured wires and components, collision
checks. (built)
**Phase 5** — ribs. (built)

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

**Labels sit perpendicular to the run, with a halo.** Offsetting a label
upward works for a horizontal wire and fails completely for a vertical one —
the name lands straight down the middle of the wire, in the wire's own colour,
where it cannot be read at all. So the offset is perpendicular to the segment
it labels, preferring above and then the right, over a dark halo so it reads
against its own wire, a component, or the grid.

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

### What the first coupon said

Printed on the Centauri Carbon in **Tucab PLA 3D850, white** — a different
brand and a different base resin grade from the filament every earlier test
used. Eighteen holes, measured with calipers.

**Every hole came out under the size it was drawn, by 0.14 ± 0.08 mm.**
Clearance lost 0.125, heat-set 0.17, self-tap about 0.12.

**The blind-versus-through distinction did not survive the spool.** T2's most
striking result was that a blind pilot in a boss lost only 0.02 mm against
0.168 for a through-hole, and that gap is the whole reason
`xy_hole_compensation` stays at 0. On this coupon the two are
indistinguishable. Both feature types are on one plate printed in one hour
under one profile, so the filament is the variable that is left. 3D850 is sold
for higher crystallinity, and crystallinity drives shrinkage — that last step
is inference, not measurement.

**The scatter grew fourfold**, from ±0.020 to ±0.084. Some of that is the
measurement rather than the part: a blind hole can only be reached at its
mouth, at the top of an 8 mm boss, where any droop in the top surface goes
straight into the reading. Inside caliper jaws are poor at these sizes; a drill
shank that slides in and the next one that does not brackets a small hole
better than the jaws do.

**The one outlier was left alone.** The M2 self-tap hole read 1.72 against a
drawn 1.60 -- the only hole on the plate wider than it was asked to be, while
its neighbours on both sides came out narrower. It was read once, and its screw
went in like all the others. Backing that screw out to re-measure would leave a
tapped thread behind and a reading of the thread rather than of the print, so
the hole is not worth re-measuring: it would answer a different question. Judged
a measurement error, and it stays in the average that produced the allowance.

**Every self-tap size took its screw**, including M1.4 and M1.7, so that whole
column is now measured rather than standard. Reported as slightly tight, which
matches holes arriving 0.14 under the tapping size, and is what the allowance
now corrects. The insert column stays assumed: their holes were measured but no
insert has been pushed into one, and a diameter is not a fit.

**There are no inserts to push.** None on hand, and they have to be ordered, so
that column is going to stay `assumed` for a while. Worth stating plainly rather
than leaving as an open task that looks a week away: the allowance for inserts
is deliberately 0, the sizes are ISO table values, and the first person to press
one in should expect to correct both.

### An allowance, rather than eighteen corrected sizes

The table keeps saying what it means — M3 self-tap is 2.5 because that is the
tapping size — and the machine's behaviour lives in one number per fixing
beside it. Self-tap 0.15 so the hole lands where the table intends; clearance 0
because those already pass a screw and wider is only looser; insert 0 and
deliberately untested, because an insert hole coming out tight is what heat-set
wants.

The panel shows both: the table value in the field you edit, and what will
actually be cut beside it.

### The smallest hole that prints round

`minHole`, now **1.0 mm**. It was 1.5, measured on through-holes in a 3 mm
plate with the old filament, where a 1.0 mm hole came out 0.18 mm out of round
— 18 % of nominal — against 0.01–0.07 everywhere from 1.5 to 4.0.

On the new filament a 1.1 mm self-tap hole came out at 1.02, round, and took
its screw. Different feature too: blind, in a boss, rather than through a
plate. **The concept held and the number did not**, which is exactly why it
lives in the profile and moves with the spool rather than being written into
the tool.

Below the floor the advice is unchanged: model generously and drill, or use a
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

## Witness lines

The diagram echoed on the plate: the outline of every component and the route
of every wire, raised a few tenths of a millimetre. A bare print then tells you
where each board sits and which way each wire runs *before* anything is on it,
which is the moment you most need to know.

They reuse the box-per-stroke the lettering already uses, so they inherit its
overlap rule and cost no new machinery.

**A wire's line breaks wherever a retainer sits.** A line under a wire lifts
the wire off the plate, and the tunnel over it has only the profile's slack to
give -- a 0.3 mm rib through 0.4 mm of clearance eats most of it. Breaking the
line reads correctly as well as measuring correctly: the retainer already marks
that stretch, so a line through it would say the same thing twice and charge
the wire for it.

Component outlines need no such break. Nothing lies in the gap between a board
and the plate, because the board is up on its standoffs.

On by default, with the relief adjustable, and switchable off for anyone who
would rather have a bare plate.

## Placing retainers automatically

Four rules, and the first is the one that matters.

**The ends of a run are clips.** A crimped Dupont connector is roughly
2.5 × 6 mm in its housing and will not thread through a 2 mm bore, so a
ready-made jumper cannot pass through a closed tunnel at all. Sizing every
tunnel to admit a connector would make them enormous for no gain along the
middle. Press the connector ends into clips; thread only the bare middle.

**A corner gets one either side, never one on it.** A wire springs out at a
bend, and a retainer sitting on the bend has to fight it. Two flanking it hold
the straights, and the corner follows.

**A straight gets one every so often**, from the profile.

**A crossing gets nothing** — see below.

### Deleting an automatic retainer is remembered

An automatic retainer you delete is not removed; it is kept with its origin
changed to `auto-suppressed`, invisible and absent from the mesh. Pressing the
auto button again will not put back the very retainer you just decided did not
belong, which is how this kind of feature usually goes wrong. Hand-placed ones
are never touched by the auto pass, and they keep it away from their
neighbourhood. A count of suppressed ones is shown with a button to restore
them, so the decision is reversible.

## Crossings

Two wires that cross in plan cannot both lie on the plate, so the tool finds
the crossings and says which wire rides over. **The proposal is that the later
wire goes over**, which is arbitrary and deliberately so: nothing about two
wires decides it, only what you want, so the rule need only be predictable.

**No retainer is placed at a crossing.** The document originally called for a
raised one there, its height set by the lower wire's diameter. That cannot be
built from the parts this design has: a retainer is a prism swept along its
wire, so its legs run *across* the lower wire's path and would land on it.
Doing it properly means a small bridge on fore-and-aft piers — a new kind of
part, for one case.

Instead the wire underneath is pinned either side of the crossing and the wire
on top is held either side too, so it rides over on its own stiffness. That is
what you would do with your hands, and it needs nothing new.

`level` remains in the format and does raise a retainer's opening — its legs
still reach the plate, which was a bug worth fixing either way, since lifting
the whole section printed an island floating in the air. A raised clip becomes
a tunnel, because jaws open at the top have nothing to carry them.

## Retainer geometry

A retainer is one cross-section swept a short way along the wire. The section
is drawn in (u, v) — across the wire and up from the plate — and sweeping it
gives a prism whose end caps are the section triangulated. That is the first
use of the triangulator for something other than the plate, and it inherited
the plate's lesson immediately: the section must be split at every vertex
height *before* triangulating, or the caps meet the side walls at points the
walls do not have.

**A tunnel is one solid; a clip is two.** A wire lying on the plate leaves
nothing for a clip's two jaws to join through, so a clip is a jaw either side
and the plate holds them apart. That is not a compromise, it is what the part
looks like.

**`t` is a fraction of the wire's length, not a coordinate**, so a retainer
stays where it was put relative to the run when the wire is redrawn around it.
Dragging one slides it along its own wire rather than moving it freely: a
retainer that is not on the wire is not holding anything.

Two failures on the way, both caught by the closed-surface test. The caps and
walls disagreed until the section was pre-split. And the pointed arch emitted
its apex twice — once ending the left arc, once beginning the right — giving a
zero-length edge; there is now a guard that drops any repeated point in a
section, since one repeated point becomes a zero-area quad.

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

### Blind holes, and holes that go through

A tube standing on a solid slab gives a **blind** hole, which is what
self-tapping screws and heat-set inserts want: the screw stops inside the boss
and nothing protrudes underneath. Those bosses are sunk 0.2 mm into the plate,
where the sunk faces end up strictly inside solid material — harmless, and it
makes the union unambiguous.

A **clearance** hole goes through, so a screw can pass and take a nut, and it
must not be sunk. Sinking it would put the tube's bore wall inside the *hole*,
duplicating the wall the plate already owns — two coincident surfaces facing
the same way, which is a real degeneracy rather than a harmless internal face.
So the plate owns the bore from 0 to its own top, the tube owns it from there
up, and they meet exactly.

A hole is only cut if it sits clear of the plate edge and of every other hole,
with 0.5 mm of material to spare. One that fails is skipped and the export
panel says so, rather than producing a face that cannot be triangulated.

### How the face is triangulated, and the two attempts that failed

The plate's faces stop being rectangles once anything goes through them, so
they have to be cut into triangles that avoid the holes. This is the one
exception to "no booleans", and it is written here rather than pulled from a
CDN because the page is self-contained and works offline.

**It is a horizontal sweep, not ear clipping.** Take every height at which any
vertex sits and consider the strips between them. Inside a strip no vertex
occurs, so every edge crossing it is a straight segment; sort the crossings by
x and pair them off, and each pair is a trapezoid.

Ear clipping was tried first and abandoned, twice:

- Bridging each hole to the nearest ring **vertex** put several bridges on the
  same corner of the plate, pinching the polygon there. Clipping stalled at 70
  triangles out of 106.
- Giving each bridge its **own** landing point fixed that and broke two holes
  sharing a horizontal line instead.

That is the point at which a reference implementation reaches for intersection
repair and recursive splitting. The sweep has none of those cases: it never
asks whether a triangle is valid, so it cannot get that question wrong. It
makes more and thinner triangles, which matters for rendering and not at all
for a slicer, which reads only the surface.

### Conforming, which is not the same as correct

A face can cover exactly the right area and still leave the solid open. If one
triangle has a corner partway along another's edge — a T-junction — the edges
no longer pair up, and that is a crack. It measures perfect and looks perfect.

Two rounds of it were found here, both by the closed-surface test and neither
by looking:

- The sweep put vertices along the plate's outline that the side walls, built
  from the four corners, knew nothing about. Fixed by splitting every ring at
  every vertex height *before* triangulating, so faces and walls are cut from
  one set of points.
- The strips' own horizontal boundaries did not line up where the number of
  crossings changed. Fixed by splitting each strip's top and bottom at every
  crossing on that line, and zipping the two chains into a strip.

A third failure was not a crack at all: `a + (b - a)` is not always exactly `b`
in floating point, so a face vertex could sit one ulp from the wall vertex
beside it. The interpolation now takes the endpoint's own coordinate when the
boundary *is* the endpoint, and the check matches vertices to a nanometre
rather than bit for bit — the STL it becomes stores float32, which is far
coarser, so exact equality was reporting cracks that did not exist.


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

## Text

Raised lettering, from a stroke font written into the page. Each glyph is a few
polylines drawn with a single pen; rendering one lays a box along every stroke
and stands it off the plate. So text is a union of boxes — the same geometry as
everything else here, needing nothing the mesh could not already do.

**Raised, not engraved.** Engraving means punching the glyph's *outline*
through the top face, which needs the outline of a stroke rather than the
stroke itself, and the triangulator. Raised text needs neither, stays legible
after handling, and does not collect the dust and stringing a fine groove does.
Engraved text is still worth having for labelling a plate something sits on top
of, and the triangulator is now there for it.

The font is in the page rather than fetched, because this tool works offline
and a web font would be the first thing to break that. It only has to be
legible at 3 mm on a printed part, which is a far easier job than reading well.

**The pen follows the cap height**, at a sixth of it, stopping at `minPen` —
the thinnest line the nozzle is worth asking for. A fixed 0.8 mm looked sensible
on its own, being two nozzle widths, and produced 3:1 letters at the 2.4 mm the
coupon labels used. Type is legible somewhere between 6:1 and 10:1; at 3:1 the
counters close up and every glyph is a blob, which is how the first coupon came
out. It matters twice on a pale filament, where raised letters have nothing but
their own shadow to read by and a fat stroke casts less of it.

### Strokes overlap, they never merely touch

Every stroke is drawn a hair longer and a hair wider than nominal — ten
microns, well under what a printer resolves. Both are the same rule the bosses
already follow, and both were found by the closed-surface test:

- **Lengthwise.** Extending each end by exactly half the pen width made a
  right-angled corner rest corner-on-corner rather than overlap. Every glyph
  with a square joint — L, E, B, D, F, G, P, R, 5, 8 — came out unclosed.
- **Crosswise.** Two parallel strokes exactly one pen width apart met face to
  face. A `0` beside an `O` did it, and so did seven other pairs.

A third case was not systematic at all. At a cap height of 2.4 mm, and only
there, two particular strokes in SQUARE, CLIP and 26 landed exactly face to
face. Hunting those one scale at a time is a losing game — the next pen width
brings a different pair — so the overlap now **varies per stroke** by a few
microns, derived from the stroke's own coordinates so it stays deterministic.
Two independently built solids then cannot share an exact face.

That is a fudge, and worth naming as one. It is there because the
closed-surface test cannot tell a shared face from a crack, and the test is
worth more kept strict than made lenient.

19 044 character pairs across nine cap heights now come out closed.

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
- **Cursor readout** — **built**, and now on the toolbar. Dashed crosshair, a
  mark on each ruler, the coordinate beside the pointer, and — when the pointer
  is over something — a filled marker in that thing's own colour with its name
  beside it. A boss names the board it holds, since that relationship is
  otherwise invisible. The identification resolves in the same order a click
  does, so the readout always names whatever a click would pick. It was pulled forward because it is not
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

### Light or dark, for the drawing only

The panels stay dark, as the rest of the tools in this repo are. The drawing is
the part you stare at, and a plate is a white thing in real life, so it gets a
switch of its own on the toolbar, remembered per browser.

**Shapes keep exactly the colour they were given.** A colour someone chose
means something, and quietly altering it would be worse than letting a pale
wire look pale. Two things make that survivable:

- **A casing under every wire**, in the theme's ink rather than the wire's own
  colour. A white wire on a white plate is otherwise invisible; this gives it
  an edge without touching it.
- **Labels are pushed toward the ink until they can be read**, keeping their
  hue. A label is a readout *about* the shape rather than the shape, so it may
  be adjusted where the shape may not. That is why a component's fill and
  border look identical between themes while its name does not.

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

## The 3D tab

The diagram says where things go. The 3D tab says whether they fit — which is a
different question, and the one a breadboard answers for free by letting you
pick the thing up.

Three layers, each switchable. **The print** is exactly what `buildMesh`
returns, so what you turn over is the STL and not a second model that could
drift away from it. **The components** are the boxes their three heights
describe, drawn translucent so the bosses and wires underneath stay visible —
the gap under a board is where the mistakes live, and a solid board hides
precisely that. **The wires** are tubes at their real outside diameter, lying on
the plate, climbing into a header at an anchored end and over anything a raised
retainer lifts them across.

Only the first layer is geometry the printer will ever see. The other two are
the things that arrive in envelopes.

### No three.js

The model viewer next door loads three.js from a CDN. That is the right trade
there and the wrong one here, because Protoplaca claims to work offline, and a
page that quietly needs the network to draw half of itself is not offline.
Vendoring the library would fix that and cost about six hundred kilobytes of
somebody else's code in a repository of hand-written single-file tools.

So the renderer is written against WebGL directly. It fits in a few hundred
lines because it only has one job — flat-shaded triangles under an orbit camera
— and because everything it draws is already a triangle list, which is the
shape the STL writer wanted anyway. If the 3D tab ever needs shadows or
outlines or a ground plane, that judgement should be made again rather than
defended.

Face normals rather than smoothed ones: every surface here is flat, and
averaging normals at a box corner paints a gradient that reads as curvature
which is not there. The light rides with the camera, because a light fixed in
world space leaves you rotating the model into its own shadow. Colours are
pushed towards linear before the shading multiplies them, or every mid tone
comes out washed.

Translucency is sorted per part, back to front, on the distance from the eye —
coarse, and enough, because the only translucent things are component boxes and
those are not supposed to interpenetrate. Where they do, the clash list says so.

### Does it fit

Everything standing on this plate is a box or is safely described by one, so
every check is the same check: do two boxes overlap, and by how much. That is
crude next to real interference detection, and it is the right crudeness. It
never reports a clash that is not there, it reports the overlap as a number you
can act on, and it runs in single-digit milliseconds so it can run on every
edit.

Five rules:

1. **The space under a board belongs to that board's own bosses.** A boss the
   component is supposed to land on is not a clash; the same boss under the
   neighbouring component is. Anything else under a footprint — a tunnel, a
   clip, a raised letter — is measured against the standoff and reported by how
   much it is too tall.
2. **Two component bodies in the same space**, footprint and height both.
3. **A component hanging off the plate.**
4. **Two things on the plate in the same place.** With one exception, below.
5. **A wire with nowhere to go under a board**, tested against the height the
   wire is actually drawn at rather than against its diameter, because a wire
   lifted over a crossing needs the room it was lifted to.

Touching is not colliding. A boss top at exactly the standoff it was built for
would otherwise report on every plate ever drawn, which is the fastest way to
teach somebody to ignore a warning list. Two hundredths of a millimetre of
tolerance.

The exception in rule 4 is that **two retainers on the same wire are allowed to
merge**. They are threading one wire, the slicer unions them into a longer
tunnel and the bore stays a bore. Two retainers on *different* wires merging is
a real fault — the bores open into each other and a wire can leave its own
channel — so that pair is still checked. The first version did not make this
distinction and reported the auto-placer's own spacing as a collision. A warning
list that flags the tool's own correct output is a warning list nobody reads.

### Boxes that do not fit their contents

A retainer is a rectangle turned to whatever angle its wire runs at. The first
version took the square that would contain it at *any* angle, which is simple
and conservative and produced five false reports on a plate with two wires on
it. It now takes the exact axis-aligned box of the turned rectangle, which is
still conservative on a diagonal, but by a fraction of a millimetre rather than
by half the diagonal.

Retainers are numbered within their wire for the same reason: two unnumbered
tunnels on one wire produce two warnings that read identically, and nothing
tells you which of the six the second one is.

### The marker is the intersection

A clash is drawn as a red box at exactly the overlap, which is the most useful
place for it and the worst place to render it: every face is coplanar with a
face that is already there, which is the one situation a depth buffer cannot
resolve. It is grown by two tenths of a millimetre so it sits outside both, and
it ignores the translucency sort and draws last — a warning has to be visible
through the very board that is causing it.

### What the 3D tab paid back

The wire length readout carried a note saying retainer climbs were not counted
yet. They are now, and not because anything was added to count them: the climbs
are measured off the same three-dimensional route the tab draws. The old number
was a sum of the standoffs at the two ends, which missed every crossing. Taking
it from the drawn path means the readout and the picture cannot disagree, and a
crossing added after the wire was measured changes the number the moment it
appears.

## Ribs

A plate with four screws pulled tight bows in the middle. A rib across it stops
that for a few grams and some floor space, which is the whole of phase 5.

**It stands up.** That is the structurally worse of the two choices and the only
printable one: the plate lies face up on the bed, so a rib underneath prints in
mid-air. Everything in this tool grows up from the plate top for the same
reason, and this is the case where it costs something — a rib on the underside
would be out of the way, and it is not available.

**It is a polyline**, drawn with the wire tool's gesture: click to place,
double-click to finish, Escape to abandon, square and 45 degrees snapped.
Deliberately the same gesture, because it is the same gesture. What differs is
that a rib anchors to nothing — it is part of the plate, not something laid on
it.

### The floor is not a printing limit

T3 swept seven fins from 0.4 to 2.0 mm. The result that matters is not which
ones printed — they all did, and Arachne filled every one of them solid, with no
void down the middle. It is **where they failed**: 0.4, 0.6 and 0.8 came away at
the joint to the base plate. A thin rib here is not unprintable, it is
**unattached**, which is worse, because it looks perfect and does nothing.

So `minRib` is 1.0 and the default is 1.2, one step up for margin. Under the
floor the panel says what will actually happen rather than "too thin".

### A rib crossing a wire

Unavoidable: a stiffener wants to run where there is space, and so does a wire.
Three things could happen, and the tool does the first that fits.

**It arches over.** The rib's cross-section is taken in (along, up) and swept
across its own width, so an opening is a shape cut out of the bottom edge of
that section — and the triangulator that cuts the plate's clearance holes cuts
this too. The arch is the tunnel's arch, for the tunnel's reason: it never
exceeds 45 degrees of overhang, so nothing is bridged and nothing sags into the
clearance the wire needs.

**It stops either side.** When the rib is too short to carry a roof over the
wire, the rib breaks rather than sitting on it. A break is a worse stiffener
than an arch and a far better one than a rib resting on a wire, and the clash
list says how tall the rib would have to be to arch instead.

**It is reported and nothing is cut.** Two cases. A wire meeting a rib at a
shallow angle needs an opening that grows as 1/sin — at ten degrees it is six
times the wire — and past about twenty degrees the wire is not crossing the rib,
it is running along it, and the answer is to move one of them. And a crossing
that lands on one of the rib's own corners falls between two sweeps and belongs
to neither.

A wire through a rib's corner crosses **both** of the segments that meet there,
and came back as two crossings a hair apart: one hole to cut and one thing to
say, so the duplicate is dropped.

### Corners

Each straight run is its own sweep, so a corner is a wedge of missing material
on the outside of the turn. It is filled with a round post of the rib's own
width. Round rather than mitred: a mitre needs the angle bisector and runs to
infinity as a rib doubles back on itself, and a rounded corner on a stiffener is
not a compromise — it is where the fillet would go anyway.

### What the clash list does and does not say about a rib

A rib running into a **boss** is not a fault, it is the point: they union into
one braced structure, and a rib that ends at a boss is stiffer than one that
stops beside it. Two ribs crossing are a grid, which is better than either one
alone. Both are excluded.

A rib through a **retainer** is still a fault — that one has a wire in it. A rib
under a **board** is measured against the standoff like anything else standing
on the plate, and it is boxed per straight run rather than as one rectangle,
because an L-shaped rib boxed as a rectangle claims the empty corner it wraps
around, which is exactly where somebody has put a component.

### On the drawing

A rib is grey with a dashed centre line, not a palette colour: it is plate, not
something laid on the plate, and the first version in a palette green was
indistinguishable from a yellow wire beside it. It draws **under** the wires,
because that is where it is. A ring marks every crossing the rib arches over and
a red cross marks every one it could not — from above those two look identical,
and they are opposites.

## What the retainer coupon said

Three gauges by three kinds, printed and handled.

**Both tunnels work.** The square roof leaves debris in the bore that has to be
picked out before a wire will go through; the arch does not, or not enough to
mention. That is the sag the arch was chosen to avoid, showing up as swarf
rather than as a closed hole. `roof` stays on `arch` by default and square stays
available, now with a reason attached rather than an argument.

**Clips are for thin wire, and only just.** A clip gripped 1.7 mm — 22 AWG —
but lightly, and did not hold 2.4 mm at all. 26 AWG went on the coupon and there
was no 26 AWG in the drawer to test it with, so below 1.7 is untested.

So `clipMaxOd` is 1.7: a ceiling with nothing proven under it, which is the
honest shape of what was learnt. Above it, automatic placement puts tunnels at
the ends of a wire instead of clips, and a clip placed by hand on a wire that
thick says so. At exactly the ceiling it says something quieter — that it holds,
but a tunnel is the sure thing.

This does not retire the clips-at-the-ends rule, it bounds it. The rule exists
because a Dupont connector has to be able to come out; on a 24 AWG jumper, which
is what most of them are, the clip still does that job.

## Why the lettering still came out badly

The first fix — pen following the cap height at a sixth of it — was the right
idea and fixed the wrong third of the problem. The second printing had three
faults, and each one turned out to be arithmetic rather than judgement.

### The pen was not a whole number of extrusions

0.5 mm on a 0.4 mm nozzle is not one line and not two. The slicer walls it with
two thin perimeters and leaves a valley between them, which off the plate reads
as **every letter drawn with two lines** — which is exactly what had happened.

The pen is now rounded to a multiple of the nozzle, and floored at two of them.
Rounding rather than flooring: one extrusion too wide is a fatter letter, one
too narrow is not a letter at all.

This has a consequence worth stating rather than burying. At 6:1, a 0.8 mm pen
puts the smallest readable cap height at **4.8 mm**. On a 0.4 nozzle there is no
such thing as legible raised 3 mm text, and the tool now says so on the text
panel instead of letting it out quietly. It says it as a ratio, too, because
"too small" would send somebody looking for the wrong knob.

### The letters were touching because the gap was measured in the wrong units

`GLYPH_GAP` is drawn in glyph units, but the ink overhangs its glyph box by half
a pen on each side. The air actually left between two letters was the gap
**minus a whole pen width**: at a 3 mm cap with a 0.5 mm pen, one tenth of a
millimetre. They printed joined up because they were drawn joined up.

The advance now includes the pen, so the gap is what it says it is —
`GLYPH_GAP` millimetres of clear air, whatever the pen is doing. Same letters,
1.0 mm apart instead of 0.1.

### Half the font was shorter than the pen drawing it

The font was already straight lines only — the round letters were polygons with
1.5-unit chamfers. At a 5 mm cap that is 0.75 mm, and at a 3 mm cap 0.45 mm:
both **shorter than the 0.8 mm pen**. A segment shorter than the pen contributes
no length, only a corner. Eight of S's eleven segments were under 2.5 units, and
twelve of the figure eight's fifteen, so those two were not letters with corners,
they were corners with a letter's worth of lumps.

Every segment is now at least 2 units — 1 mm at a 5 mm cap, longer than the pen
is wide. Where a letter was round it is now square, or cut at 45 degrees over two
units or more. That is less a compromise forced by the printer than an admission
of what the printer was already doing: the old chamfers were being swallowed
whole, so the letters were already square, just square with lumps on the corners.

B and 8 had to be told apart after both went rectangular — B keeps a full-height
stem with two pointed bowls, 8 is a rectangle with a bar. S and 5 likewise: S has
its corners cut, 5 does not.

### The coupon turned ninety degrees

Everything on the calibration coupon is laid out from the cap height now rather
than the other way round, and at 5 mm that moves things. The first attempt kept
the old arrangement — a column per screw size — and a 5 mm `M1.4` is 17.4 mm
wide, so the headings ran into each other and printed `M1.4M1.7`. Widening the
column pitch until six of them read as six separate labels took the plate to
137 x 89.5 mm, and they *still* read as one long word at 21 mm pitch, because
2.8 mm of air between two labels next to 1.0 mm between two letters is not a
big enough difference to see.

Turning it round fixes it properly. A **row** per screw size puts the wide label
in the left margin with a whole row to itself and nothing beside it; a **column**
per fixing puts one letter across the top. The column pitch drops back to what
the bosses need rather than what the labels need.

71 x 118 mm, against 137 x 89.5 for the wide version: a third less plate, and
the number you actually care about is spelled out in full instead of abbreviated.
The key needs three lines either way, because one would be 139 mm long.

The Portuguese coupon comes out at 90 x 118, because `A = AUTOROSCANTE` is
longer than `S = SELF-TAP`. The plate is measured from the text rather than
fixed, so that happens by itself.

Two bugs fell out of moving the retainer coupon to the same size. Its gauge
labels had been sitting on top of the wires — invisible at 3 mm, obvious at 5 —
and its retainers had been one left margin to the right of the headings that name
them, because `t` is a fraction of the wire and the wire does not start at zero.

**Saved documents keep their own numbers.** A project written before this has
0.5 mm text in it and will stay that way; the panel warns rather than the file
being quietly rewritten, because a document is the user's and not the tool's.

## The palette

Fifteen colours, the same fifteen the model viewer offers, **copied rather than
shared**. The model viewer reads them from a `manifest.json` generated by the
Fantoma case scripts, and Protoplaca is not allowed to depend on Fantoma.
Copying means the two can drift apart; sharing would mean this tool stops
working the moment somebody moves a Python file in another project. Drift is the
cheaper failure.

Why a palette at all, when the colour picker can produce sixteen million:
picking from fifteen is a decision, picking from a gradient is a chore. The
custom picker stays beside it for the case where the real part is a colour
nothing here matches.

New wires cycle through a different order from new components — red and black
first, because the first two wires anybody draws are power and ground. The
palette has no brown and no violet, which a real ribbon does. Said here rather
than quietly solved by inventing two colours the other tool does not have.

## Deferred, deliberately

- **Non-rectangular plate outlines.** Rectangle in phase 1; arbitrary polygons once
  the rest works.
- **Plates larger than the build volume.** The editor should warn when the plate
  exceeds the profile's build volume. Splitting a large plate into joined tiles is a
  separate feature and not currently planned.
- **Junctions.** Wires run point to point. Where three wires must meet, that is a
  component — a terminal block — not a wire feature.
- **Lightening and ventilation holes** in the plate.
- **Heat-set inserts**, until there are some. None on hand; they have to be
  ordered.
- **Ribs on the underside**, which would be out of the way and would need
  either supports or a second print orientation.
- **Engraved text.** Raised text is legible now that the pen follows the cap
  height, so the reason for engraving it — that raised text was hard to read —
  has gone. The triangulator could cut it if a plate ever needs something
  underneath a part that would rub raised letters away.
- **Per-triangle sorting in the 3D tab.** Per part is enough while the only
  translucent things are component boxes.
