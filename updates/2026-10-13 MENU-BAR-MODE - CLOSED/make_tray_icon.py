#!/usr/bin/env python3
"""Generate the macOS menu-bar (tray) template icon for Pensieve.

The menu-bar glyph is the Pensieve sigil's INNER mark only — the basin rim, the
rising wisp of memory, and the spark — with NO background tile. It is drawn as a
solid-black shape on a transparent canvas; set as a macOS *template* image, macOS
tints it automatically (white on the dark menu bar, black on light), so it sits
with the other system icons.

Coordinates come straight from app-icon.svg / Logo.tsx (a 48-unit space). We draw
at 8x supersampling and downscale with LANCZOS for clean anti-aliasing (Pillow has
no native AA for outlined ellipses / thick lines).
"""
from PIL import Image, ImageDraw

SIZE = 44          # output px (retina 2x of a ~22pt menu-bar slot)
MARGIN = 5         # px padding inside the square
S = 8              # supersample factor
STROKE = 2.4       # stroke width in 48-space units

# --- glyph geometry in the 48-unit viewBox -------------------------------------
RIM = (24, 29, 17, 9)          # cx, cy, rx, ry
SPARK = (24, 5.4, 1.3)         # cx, cy, r
WISP = [                        # two cubic bezier segments (P0,C1,C2,P3)
    ((24, 25), (20, 18), (30, 14), (26, 8)),
    ((26, 8), (24, 11), (22, 9), (24, 6)),
]

# glyph bounding box in 48-space (used to centre + fit with an even margin)
hs = STROKE / 2
BX0, BY0 = 24 - 17 - hs, (5.4 - 1.3)
BW = (24 + 17 + hs) - BX0
BH = (29 + 9 + hs) - BY0

scale = (SIZE - 2 * MARGIN) / max(BW, BH)
ox = (SIZE - BW * scale) / 2
oy = (SIZE - BH * scale) / 2


def T(x, y):
    return ((ox + (x - BX0) * scale) * S, (oy + (y - BY0) * scale) * S)


def cubic(p0, c1, c2, p3, n=90):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        x = u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0]
        y = u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]
        pts.append((x, y))
    return pts


big = SIZE * S
img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
BLACK = (0, 0, 0, 255)
w = STROKE * scale * S

# basin rim (ellipse outline)
cx, cy, rx, ry = RIM
x0, y0 = T(cx - rx, cy - ry)
x1, y1 = T(cx + rx, cy + ry)
d.ellipse([x0, y0, x1, y1], outline=BLACK, width=round(w))

# wisp — stroke each bezier as a dense run of filled dots (gives round caps + joins)
r = w / 2
for seg in WISP:
    for (x, y) in cubic(*seg):
        px, py = T(x, y)
        d.ellipse([px - r, py - r, px + r, py + r], fill=BLACK)

# spark
sx, sy, sr = SPARK
px, py = T(sx, sy)
pr = sr * scale * S
d.ellipse([px - pr, py - pr, px + pr, py + pr], fill=BLACK)

out = img.resize((SIZE, SIZE), Image.LANCZOS)
import sys
dest = sys.argv[1] if len(sys.argv) > 1 else "tray.png"
out.save(dest)
print("wrote", dest, out.size)
