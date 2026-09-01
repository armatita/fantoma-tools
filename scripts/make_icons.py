#!/usr/bin/env python3
"""Generate the PWA icons for every Fantoma tool.

No third-party dependencies: PNGs are written by hand with zlib + struct.
Each icon is authored as a small pixel grid and scaled up with nearest-
neighbour sampling, which keeps the edges hard -- appropriate for a set of
pixel-art tools, and it means the source of truth is legible ASCII rather
than a binary nobody can edit.

Layout: the 16x16 artwork sits inside a 20x20 field, so the art occupies the
central 80%. That is the "safe zone" Android reserves when it masks an icon
into a circle or squircle, which lets one file serve as both `any` and
`maskable` without the art being clipped.

Usage:  python scripts/make_icons.py
"""

import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FIELD = 20          # full icon grid, including the maskable safe margin
ART = 16            # the artwork itself
OFFSET = (FIELD - ART) // 2
SIZES = (192, 512)


# --------------------------------------------------------------------------
# PNG writing
# --------------------------------------------------------------------------

def write_png(path, width, height, pixels):
    """pixels: flat bytearray of RGBA, length width*height*4."""
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)                       # filter type 0 (None) per scanline
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        body = tag + data
        return (struct.pack('>I', len(data)) + body
                + struct.pack('>I', zlib.crc32(body) & 0xffffffff))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as fh:
        fh.write(png)


def hex_rgba(value):
    value = value.lstrip('#')
    if len(value) == 6:
        value += 'ff'
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4, 6))


class Grid:
    """A FIELD x FIELD canvas of RGBA tuples."""

    def __init__(self, background):
        self.bg = hex_rgba(background)
        self.cells = [[self.bg] * FIELD for _ in range(FIELD)]

    def set(self, x, y, colour):
        if 0 <= x < FIELD and 0 <= y < FIELD:
            self.cells[y][x] = hex_rgba(colour) if isinstance(colour, str) else colour

    def rect(self, x, y, w, h, colour):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set(xx, yy, colour)

    def art(self, rows, palette):
        """Stamp a 16x16 ASCII sprite into the centre of the field."""
        assert len(rows) == ART, f'sprite must be {ART} rows, got {len(rows)}'
        for y, row in enumerate(rows):
            assert len(row) == ART, f'row {y} must be {ART} chars, got {len(row)}'
            for x, ch in enumerate(row):
                if ch in palette:
                    self.set(x + OFFSET, y + OFFSET, palette[ch])

    def to_png(self, path, size):
        pixels = bytearray(size * size * 4)
        i = 0
        for y in range(size):
            sy = y * FIELD // size
            row = self.cells[sy]
            for x in range(size):
                r, g, b, a = row[x * FIELD // size]
                pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a
                i += 4
        write_png(path, size, size, pixels)


# --------------------------------------------------------------------------
# The three icons
# --------------------------------------------------------------------------

def hub_icon():
    """Fantoma: a little ghost. 'Fantoma' is a phantom, so the launcher wears one."""
    sprite = [
        '................',
        '.....######.....',
        '...##########...',
        '..############..',
        '.##############.',
        '.###oo####oo###.',
        '.###oo####oo###.',
        '.##############.',
        '.##############.',
        '.##############.',
        '.##############.',
        '.##############.',
        '.##############.',
        '.##############.',
        '.##..##..##..##.',
        '................',
    ]
    g = Grid('#0d0d12')
    g.art(sprite, {'#': '#5ee88f', 'o': '#0d0d12'})
    return g


def pixel_studio_icon():
    """Pixel Studio: a nine-swatch palette."""
    g = Grid('#0d0d12')
    swatches = [
        '#ff4d5e', '#ffb84d', '#ffe94d',
        '#5ee88f', '#4dd8ff', '#5c7dff',
        '#b45cff', '#ff5cd6', '#f4f4f2',
    ]
    for idx, colour in enumerate(swatches):
        col, row = idx % 3, idx // 3
        g.rect(OFFSET + 1 + col * 5, OFFSET + 1 + row * 5, 4, 4, colour)
    return g


def sfx_forge_icon():
    """SFX Forge: a square wave, the shape a passive buzzer actually makes."""
    g = Grid('#0a0d0a')
    amber = '#ffb648'
    high, low, thick = 4, 11, 2
    for x in range(ART):
        is_high = (x // 4) % 2 == 0
        y = high if is_high else low
        g.rect(OFFSET + x, OFFSET + y, 1, thick, amber)
    # Vertical risers at each transition, joining the two levels.
    for x in (4, 8, 12):
        g.rect(OFFSET + x, OFFSET + high, thick, low - high + thick, amber)
    return g


ICONS = {
    'icons': hub_icon,
    'tools/pixel-studio/icons': pixel_studio_icon,
    'tools/sfx-forge/icons': sfx_forge_icon,
}


def main():
    for folder, builder in ICONS.items():
        grid = builder()
        for size in SIZES:
            path = os.path.join(ROOT, folder, f'icon-{size}.png')
            grid.to_png(path, size)
            print(f'wrote {os.path.relpath(path, ROOT)}')


if __name__ == '__main__':
    main()
