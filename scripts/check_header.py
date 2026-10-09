#!/usr/bin/env python3
"""
check_header.py -- prove a Canvas export by decoding it, as the engine would.

    python scripts/check_header.py hero.h
    python scripts/check_header.py hero.h --against ../fantoma/cpp/refactor/assets/hero_*.h

The first form checks one exported header against image.h's rules. The
second also compares it, image by image, with headers another generator
wrote (img2c.py, build_hero.py).

WHY DECODE AND NOT DIFF

img2c.py quantises with Pillow, which picks its own palette order. Canvas
keeps the author's order, because palette swaps depend on it. So the two
produce different bytes for the same picture, and a byte diff proves
nothing. Two headers are EQUAL here when:

  - every Image with the same name has the same width, height, frames,
    stride, log2_bpp, flags, transparent and frame_ms; and
  - every pixel of every frame decodes to the same RGB565 colour, or is
    transparent in both.

The decoder is written from image.h, not from Canvas's JavaScript, so a
misreading of the format in one is not repeated in the other.

WHAT A SINGLE HEADER MUST SATISFY (image.h and docs/image-format.md)

  - every Image field, in declaration order (C++ under -Werror);
  - stride == (width * bpp + 7) / 8, data == stride * height * frames bytes;
  - a palette of exactly 1 << bpp entries;
  - frame_ms == 0 for a single frame;
  - for a Canvas header: an enum and a <name>_states[] table that list the
    same Images in the same order, and CELL_W/H matching the Images.

Plain text parsing, standard library only: it reads the output of two
known generators, not arbitrary C.
"""
import argparse
import glob
import re
import sys

FIELDS = ["data", "palette", "width", "height", "frames", "stride",
          "log2_bpp", "flags", "transparent", "frame_ms"]
COMPARED = FIELDS[2:]
IMAGE_HAS_TRANSPARENT = 0x01
IMAGE_PLAY_ONCE = 0x02

ARRAY = re.compile(r"static\s+const\s+(uint8_t|uint16_t)\s+(\w+)\s*\[\s*(\w*)\s*\]\s*=\s*\{(.*?)\};", re.S)
IMAGE = re.compile(r"static\s+const\s+Image\s+(\w+)\s*=\s*\{(.*?)\};", re.S)
TABLE = re.compile(r"static\s+const\s+Image\s*\*\s*const\s+(\w+)\s*\[\s*(\w*)\s*\]\s*=\s*\{(.*?)\};", re.S)
ENUM = re.compile(r"enum\s*\{(.*?)\};", re.S)
DEFINE = re.compile(r"^#define\s+(\w+)\s+(\d+)", re.M)


def strip_comments(text):
    return re.sub(r"/\*.*?\*/", " ", text, flags=re.S)


FLAG_NAMES = {"IMAGE_HAS_TRANSPARENT": IMAGE_HAS_TRANSPARENT, "IMAGE_PLAY_ONCE": IMAGE_PLAY_ONCE}


def number(tok, what):
    tok = tok.strip()
    if "|" in tok:                       # flags: IMAGE_HAS_TRANSPARENT | IMAGE_PLAY_ONCE
        v = 0
        for part in tok.split("|"):
            v |= number(part, what)
        return v
    if tok in FLAG_NAMES:
        return FLAG_NAMES[tok]
    try:
        return int(tok, 0)
    except ValueError:
        raise SystemExit(f"{what}: cannot read {tok!r} as a number")


class Header:
    def __init__(self, path):
        self.path = path
        self.problems = []
        # errors="replace": img2c.py writes its comment's em dash in the
        # Windows code page (byte 0x97), which is not UTF-8. Only comments
        # hold it, and comments are discarded.
        raw = open(path, encoding="utf-8", errors="replace").read()
        # A tileset for tilemap.h: frames are tiles, picked by a map cell,
        # not by time, so frame_ms 0 with many frames is right there.
        self.tileset = "ONE Image for tilemap.h" in re.sub(r"\s*\n\s*\*\s*", " ", raw)
        text = strip_comments(raw)

        self.arrays = {}
        for kind, name, size, body in ARRAY.findall(text):
            vals = [number(v, f"{path}: {name}") for v in body.split(",") if v.strip()]
            if size and int(size, 0) != len(vals):
                self.problem(f"{name}[{size}] has {len(vals)} values")
            self.arrays[name] = vals

        self.images = {}
        for name, body in IMAGE.findall(text):
            pairs = re.findall(r"\.(\w+)\s*=\s*([^,]+?)\s*(?:,|$)", body.strip())
            order = [k for k, _ in pairs]
            if order != FIELDS:
                self.problem(f"{name}: fields are {order}, image.h declares {FIELDS} "
                             "(C++ needs all of them, in that order)")
            f = dict(pairs)
            img = {k: number(f[k], f"{path}: {name}.{k}") for k in COMPARED if k in f}
            img["data"], img["palette"] = f.get("data"), f.get("palette")
            self.images[name] = img

        self.tables = {name: [re.sub(r"[&\s]", "", e) for e in body.split(",") if e.strip()]
                       for name, _, body in TABLE.findall(text)}
        self.enums = [[e.split("=")[0].strip() for e in body.split(",") if e.strip()]
                      for body in ENUM.findall(text)]
        self.defines = {k: int(v) for k, v in DEFINE.findall(text)}
        self.decoded = {n: self.decode(n) for n in self.images}

    def problem(self, msg):
        self.problems.append(msg)

    def decode(self, name):
        """[frame][y][x] -> RGB565 int, or None where transparent."""
        img = self.images[name]
        try:
            w, h, n = img["width"], img["height"], img["frames"]
            l2, stride = img["log2_bpp"], img["stride"]
        except KeyError as e:
            self.problem(f"{name}: no .{e.args[0]}")
            return None
        if l2 not in (0, 1, 2, 3):
            self.problem(f"{name}: log2_bpp {l2} is not 0..3")
            return None
        bpp = 1 << l2
        data, pal = self.arrays.get(img["data"]), self.arrays.get(img["palette"])
        if data is None or pal is None:
            self.problem(f"{name}: data or palette array not found in this header")
            return None
        if stride != (w * bpp + 7) // 8:
            self.problem(f"{name}: stride {stride}, but ({w}*{bpp}+7)/8 = {(w * bpp + 7) // 8}")
        if len(data) != stride * h * n:
            self.problem(f"{name}: {len(data)} data bytes, expected stride*height*frames = {stride * h * n}")
            return None
        if len(pal) != 1 << bpp:
            self.problem(f"{name}: palette has {len(pal)} entries, image.h wants 1 << bpp = {1 << bpp}")
        if n > 1 and img["frame_ms"] == 0 and not self.tileset:
            self.problem(f"{name}: {n} frames but frame_ms 0, so only the first is ever shown")
        if n == 1 and img["frame_ms"] != 0:
            self.problem(f"{name}: one frame, so frame_ms should be 0 (it is {img['frame_ms']})")
        transparent = img["flags"] & IMAGE_HAS_TRANSPARENT
        frames = []
        for f in range(n):
            rows = []
            for y in range(h):
                row = []
                for x in range(w):
                    # image_pixel(), line for line.
                    bit = x << l2
                    byte = data[f * stride * h + y * stride + (bit >> 3)]
                    idx = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1)
                    if idx >= len(pal):
                        self.problem(f"{name}: frame {f} ({x},{y}) index {idx} is past the palette")
                        row.append(("bad", idx))
                    elif transparent and idx == img["transparent"]:
                        row.append(None)
                    else:
                        row.append(pal[idx])
                rows.append(row)
            frames.append(rows)
        return frames

    def check_canvas_shape(self):
        """The multi-state part: enum, table and defines agree with the Images."""
        if not self.tables:
            return
        for tname, entries in self.tables.items():
            obj = tname[:-len("_states")] if tname.endswith("_states") else tname
            U = obj.upper()
            missing = [e for e in entries if e not in self.images]
            if missing:
                self.problem(f"{tname} points at {missing}, which this header does not define")
            enum = next((e for e in self.enums if e and e[-1] == U + "_STATE_COUNT"), None)
            if enum is None:
                self.problem(f"no enum ending in {U}_STATE_COUNT")
            else:
                want = [U + "_" + e[len(obj) + 1:].upper() for e in entries]
                if enum[:-1] != want:
                    self.problem(f"enum {enum[:-1]} does not follow {tname} {want}")
            for key, field in (("CELL_W", "width"), ("CELL_H", "height")):
                v = self.defines.get(U + "_" + key)
                if v is None:
                    self.problem(f"no #define {U}_{key}")
                elif any(self.images[e][field] != v for e in entries if e in self.images):
                    self.problem(f"{U}_{key} {v} disagrees with an Image's {field}")
            for key in ("BOX_W", "BOX_H"):
                if U + "_" + key not in self.defines:
                    self.problem(f"no #define {U}_{key}")
            pals = {self.images[e]["palette"] for e in entries if e in self.images}
            if len(pals) != 1:
                self.problem(f"{tname}: states use {len(pals)} palettes; a sprite shares one")


def compare(name, a, b, a_hdr, b_hdr):
    """List of differences between Image `name` in two headers."""
    ia, ib = a_hdr.images[name], b_hdr.images[name]
    out = [f"{k}: {ia.get(k)} vs {ib.get(k)}" for k in COMPARED if ia.get(k) != ib.get(k)]
    if a is None or b is None:
        return out + ["could not decode both"]
    if out:
        return out
    for f, (fa, fb) in enumerate(zip(a, b)):
        for y, (ra, rb) in enumerate(zip(fa, fb)):
            for x, (pa, pb) in enumerate(zip(ra, rb)):
                if pa != pb:
                    show = lambda p: "transparent" if p is None else f"0x{p:04X}" if isinstance(p, int) else str(p)
                    out.append(f"frame {f} pixel ({x},{y}): {show(pa)} vs {show(pb)}")
                    if len(out) >= 5:
                        return out + ["..."]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("header", nargs="+", help="the header(s) under test (Canvas exports)")
    ap.add_argument("--against", nargs="+", default=[], help="reference headers (globs are expanded)")
    args = ap.parse_args()

    def expand(paths):
        out = []
        for p in paths:
            out += sorted(glob.glob(p)) or [p]
        return out

    ok = True
    tested = [Header(p) for p in expand(args.header)]
    refs = [Header(p) for p in expand(args.against)]
    for hdr in tested:
        hdr.check_canvas_shape()
    for hdr in tested + refs:
        for p in hdr.problems:
            print(f"PROBLEM {hdr.path}: {p}")
            ok = False
        n_frames = sum(i.get("frames", 0) for i in hdr.images.values())
        print(f"read {hdr.path}: {len(hdr.images)} Image(s), {n_frames} frame(s)")

    if refs:
        test_names = {n: h for h in tested for n in h.images}
        ref_names = {n: h for h in refs for n in h.images}
        for n in sorted(set(test_names) | set(ref_names)):
            if n not in test_names:
                print(f"MISSING {n}: only in the reference headers")
                ok = False
                continue
            if n not in ref_names:
                print(f"EXTRA   {n}: no reference to compare with")
                continue
            ta, rb = test_names[n], ref_names[n]
            diffs = compare(n, ta.decoded[n], rb.decoded[n], ta, rb)
            img = ta.images[n]
            desc = f"{img['width']}x{img['height']} x{img['frames']}, {1 << img['log2_bpp']} bpp"
            if diffs:
                ok = False
                print(f"DIFFER  {n} ({desc}):")
                for d in diffs:
                    print(f"          {d}")
            else:
                pixels = img["width"] * img["height"] * img["frames"]
                print(f"SAME    {n} ({desc}): fields equal, {pixels} pixels decode equal")

    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
