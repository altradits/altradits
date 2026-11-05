#!/usr/bin/env python3
"""Minimal 2027 backgrounds: word-free templates, drawn from code.

12 monthly motifs (docs/marketing-2027.md) times 4 families (Paper, Ink,
Split, Frame), each in two variants (A: the main arrangement, B: a second
arrangement of the same motif). Variant A ships as bg-72..119; variant B
ships per quarter (Q1 motifs first) as bg-120 onward. Each background ships
as bg-NN.jpg (clean, the editor draws on it) with a tpl-NN.jpg thumbnail
(logo composited, the gallery shows it).

Usage:
  python3 deploy/mkt-bg.py                    # write all shipped backgrounds
  python3 deploy/mkt-bg.py --json             # print the templates.json entries
  python3 deploy/mkt-bg.py --out DIR          # write into DIR instead

Later quarters append their months to B_QUARTERS with NAMES_B rows and
variant-B specs. Deterministic: every shape is an explicit spec, there is
no randomness, and JPEG settings are fixed, so the same Pillow build gives
the same bytes.

Needs: pillow, numpy (pip install pillow numpy).
"""
import json
import math
import os
import sys

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("mkt-bg needs pillow and numpy: pip install pillow numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1920, 1280
SS = 2  # supersample, then downscale for clean edges
MAX_BYTES = 150 * 1024

NAVY = (15, 27, 45)
WHITE = (255, 255, 255)
RED = (234, 81, 88)
CREAM = (255, 247, 236)
BLACK = (0, 0, 0)
ORANGE = (247, 147, 26)

# Keep-out zones, final pixels: (x0, y0, x1, y1), verified pure ground.
# Footer ink on shipped cards ends near x1874, y1238, so the rim right of
# x1880 and below y1248 stays usable for small corner marks.
ZONES = {
    "text": (60, 60, 1260, 1020),
    "logo": (60, 1050, 460, 1225),
    "footer": (1700, 1200, 1880, 1248),
}

# Monthly motifs: shape language plus accent. Cream grounds read warmer;
# the rest stay white.
MOTIFS = {
    1: {"shape": "ring", "accent": ORANGE, "ground": WHITE},
    2: {"shape": "lines", "accent": RED, "ground": WHITE},
    3: {"shape": "squares", "accent": NAVY, "ground": WHITE},
    4: {"shape": "arcs", "accent": BLACK, "ground": CREAM},
    5: {"shape": "dots", "accent": NAVY, "ground": WHITE},
    6: {"shape": "cross", "accent": RED, "ground": WHITE},
    7: {"shape": "rays", "accent": NAVY, "ground": CREAM},
    8: {"shape": "bars", "accent": RED, "ground": WHITE},
    9: {"shape": "steps", "accent": NAVY, "ground": WHITE},
    10: {"shape": "wave", "accent": RED, "ground": CREAM},
    11: {"shape": "triangle", "accent": NAVY, "ground": WHITE},
    12: {"shape": "zigzag", "accent": BLACK, "ground": CREAM},
}

NAMES = {
    ("paper", 1): "Orange ring", ("ink", 1): "Night coin",
    ("split", 1): "Coin split", ("frame", 1): "Ring corners",
    ("paper", 2): "Red routes", ("ink", 2): "Night lines",
    ("split", 2): "Route split", ("frame", 2): "Twin rules",
    ("paper", 3): "Navy blocks", ("ink", 3): "Night squares",
    ("split", 3): "Block split", ("frame", 3): "Double frame",
    ("paper", 4): "Black arcs", ("ink", 4): "Night arcs",
    ("split", 4): "Arc split", ("frame", 4): "Arc corners",
    ("paper", 5): "Navy confetti", ("ink", 5): "Night dots",
    ("split", 5): "Dot split", ("frame", 5): "Dotted frame",
    ("paper", 6): "Red crosses", ("ink", 6): "Night plus",
    ("split", 6): "Cross split", ("frame", 6): "Plus corners",
    ("paper", 7): "Navy rays", ("ink", 7): "Night rays",
    ("split", 7): "Ray split", ("frame", 7): "Ray corners",
    ("paper", 8): "Red bars", ("ink", 8): "Night bars",
    ("split", 8): "Bar split", ("frame", 8): "Side bars",
    ("paper", 9): "Navy steps", ("ink", 9): "Night steps",
    ("split", 9): "Step split", ("frame", 9): "Step corners",
    ("paper", 10): "Red waves", ("ink", 10): "Night waves",
    ("split", 10): "Wave split", ("frame", 10): "Wave rule",
    ("paper", 11): "Navy play", ("ink", 11): "Night play",
    ("split", 11): "Play split", ("frame", 11): "Play corners",
    ("paper", 12): "Black pulse", ("ink", 12): "Night pulse",
    ("split", 12): "Pulse split", ("frame", 12): "Pulse rule",
}

FAMILIES = ["paper", "ink", "split", "frame"]
FIRST_NUM = 72


def num_of(family, month):
    return FIRST_NUM + FAMILIES.index(family) * 12 + (month - 1)


# Variant B ships per quarter so each quarterly PR stays reviewable.
B_QUARTERS = {1: [1, 2, 3], 2: [4, 5, 6]}
B_FIRST_NUM = 120

NAMES_B = {
    ("paper", 1): "Ring low", ("ink", 1): "Night ring low",
    ("split", 1): "Coin split wide", ("frame", 1): "Ring edges",
    ("paper", 2): "Routes low", ("ink", 2): "Night routes",
    ("split", 2): "Route split wide", ("frame", 2): "Side rules",
    ("paper", 3): "Blocks low", ("ink", 3): "Night blocks",
    ("split", 3): "Block split wide", ("frame", 3): "Single frame",
    ("paper", 4): "Arcs low", ("ink", 4): "Night arcs low",
    ("split", 4): "Arc split wide", ("frame", 4): "Arc edges",
    ("paper", 5): "Dots low", ("ink", 5): "Night dots low",
    ("split", 5): "Dot split wide", ("frame", 5): "Dot rules",
    ("paper", 6): "Crosses low", ("ink", 6): "Night plus low",
    ("split", 6): "Cross split wide", ("frame", 6): "Plus edges",
}


def num_of_b(family, month):
    for q, months in B_QUARTERS.items():
        if month in months:
            # B_BASE_NUMS holds the quarters that break the straight
            # 12-per-quarter run; it lives with their blocks, below.
            base = B_BASE_NUMS.get(q, B_FIRST_NUM + (q - 1) * 12)
            return (base +
                    FAMILIES.index(family) * 3 + months.index(month))
    raise KeyError(f"no variant B quarter holds month {month}")


def blank(ground):
    return Image.new("RGB", (W * SS, H * SS), ground)


# Shape painters. Each draws one motif mark in final-pixel coordinates on a
# supersampled ImageDraw. (cx, cy) anchors the mark, k scales it.
def paint_ring(d, cx, cy, k, color):
    r, w = 250 * k, 16
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=w)


def paint_lines(d, cx, cy, k, color):
    w = 12
    for i, ln in enumerate((440, 360, 280)):
        y = cy - 80 * k + i * 80 * k
        x0 = cx - 220 * k
        d.line([x0, y, x0 + ln * k, y], fill=color, width=w)


def paint_squares(d, cx, cy, k, color):
    w = 14
    for inset, size in ((0, 420), (90, 240)):
        x0, y0 = cx - 210 * k + inset * k, cy - 210 * k + inset * k
        d.rectangle([x0, y0, x0 + size * k, y0 + size * k],
                    outline=color, width=w)


def paint_arcs(d, cx, cy, k, color):
    w = 14
    for r in (500, 420, 340):
        d.arc([cx - r * k, cy - r * k, cx + r * k, cy + r * k],
              start=180, end=270, fill=color, width=w)


def paint_dots(d, cx, cy, k, color):
    r, gap = 20 * k, 130 * k
    for ix in range(3):
        for iy in range(3):
            x, y = cx - gap + ix * gap, cy - gap + iy * gap
            d.ellipse([x - r, y - r, x + r, y + r], fill=color)


def paint_cross(d, cx, cy, k, color):
    arm, w = 200 * k, 18 * k
    d.rectangle([cx - w / 2, cy - arm, cx + w / 2, cy + arm], fill=color)
    d.rectangle([cx - arm, cy - w / 2, cx + arm, cy + w / 2], fill=color)


def paint_rays(d, cx, cy, k, color):
    h = 14 * k
    for i, ln in enumerate((440, 360, 280, 200)):
        y = cy - 150 * k + i * 100 * k
        x0 = cx - 220 * k
        d.rectangle([x0, y - h / 2, x0 + ln * k, y + h / 2], fill=color)


def paint_bars(d, cx, cy, k, color):
    w, gap, base = 70 * k, 40 * k, cy + 350 * k
    x = cx - (4 * w + 3 * gap) / 2
    for h in (200, 300, 420, 540):
        d.rectangle([x, base - h * k, x + w, base], fill=color)
        x += w + gap


def paint_steps(d, cx, cy, k, color):
    run, rise, n = 140 * k, 110 * k, 3
    x, y = cx - n * run / 2, cy + n * rise / 2
    pts = [(x, y)]
    for _ in range(n):
        pts += [(x + run, y), (x + run, y - rise)]
        x, y = x + run, y - rise
    d.line(pts, fill=color, width=16, joint="miter")


def paint_wave(d, cx, cy, k, color):
    pts = [(cx - 210 * k + t * 420 * k,
            cy + np.sin(t * 4 * np.pi) * 60 * k)
           for t in np.linspace(0, 1, 120)]
    d.line(pts, fill=color, width=14, joint="curve")


def paint_triangle(d, cx, cy, k, color):
    s = 380 * k
    h = s * 0.866
    d.polygon([(cx - s / 2, cy + h / 2), (cx + s / 2, cy + h / 2),
               (cx, cy - h / 2)], fill=color)


def paint_zigzag(d, cx, cy, k, color):
    pts, n = [], 3
    for i in range(2 * n + 1):
        x = cx - 210 * k + i * 420 * k / (2 * n)
        y = cy + (90 * k if i % 2 else -90 * k) * (0 if i in (0, 2 * n) else 1)
        pts.append((x, y))
    d.line(pts, fill=color, width=14, joint="miter")


SHAPES = {"ring": paint_ring, "lines": paint_lines, "squares": paint_squares,
          "arcs": paint_arcs, "dots": paint_dots, "cross": paint_cross,
          "rays": paint_rays, "bars": paint_bars, "steps": paint_steps,
          "wave": paint_wave, "triangle": paint_triangle,
          "zigzag": paint_zigzag}

# Paper/Ink anchors: one mark on the right, clear of every zone.
ANCHORS = {1: (1590, 540, 1.0), 2: (1600, 560, 1.0), 3: (1600, 630, 1.0),
            4: (1800, 1000, 1.0), 5: (1550, 550, 1.0), 6: (1580, 600, 1.0),
            7: (1600, 570, 1.0), 8: (1600, 600, 1.0), 9: (1590, 735, 1.0),
            10: (1590, 620, 1.0), 11: (1590, 595, 1.0), 12: (1590, 620, 1.0)}


class SSDraw:
    """ImageDraw wrapper: callers use final pixels, output is supersampled."""

    def __init__(self, draw):
        self._d = draw

    @staticmethod
    def _p(v):
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return v * SS
        return [SSDraw._p(x) for x in v]

    def _m(self, name, xy, *args, **kw):
        if "width" in kw and kw["width"] is not None:
            kw["width"] = int(kw["width"] * SS)
        return getattr(self._d, name)(self._p(list(xy)), *args, **kw)

    def line(self, xy, *a, **k):
        return self._m("line", xy, *a, **k)

    def rectangle(self, xy, *a, **k):
        return self._m("rectangle", xy, *a, **k)

    def ellipse(self, xy, *a, **k):
        return self._m("ellipse", xy, *a, **k)

    def arc(self, xy, *a, **k):
        return self._m("arc", xy, *a, **k)

    def polygon(self, xy, *a, **k):
        return self._m("polygon", xy, *a, **k)


# Variant-B anchors: the same motif lower and smaller.
ANCHORS_B = {1: (1620, 780, 0.8), 2: (1600, 640, 0.8), 3: (1600, 600, 0.8),
            4: (1700, 1080, 0.8), 5: (1620, 800, 0.8), 6: (1650, 850, 0.75)}


def paint_paper(month, variant="A"):
    m = MOTIFS[month]
    img = blank(m["ground"])
    d = SSDraw(ImageDraw.Draw(img))
    anchors = ANCHORS if variant == "A" else ANCHORS_B
    SHAPES[m["shape"]](d, *anchors[month], m["accent"])
    return img, [m["ground"]]


def paint_ink(month, variant="A"):
    m = MOTIFS[month]
    img = blank(NAVY)
    d = SSDraw(ImageDraw.Draw(img))
    color = ORANGE if month == 1 else WHITE
    anchors = ANCHORS if variant == "A" else ANCHORS_B
    SHAPES[m["shape"]](d, *anchors[month], color)
    return img, [NAVY]


# Split specs: left text field, right art field, edge x, curved edge or not.
SPLITS = {1: (WHITE, NAVY, 1500, False), 2: (WHITE, RED, 1470, True),
          3: (NAVY, WHITE, 1420, False), 4: (CREAM, BLACK, 1500, True),
          5: (WHITE, NAVY, 1440, True), 6: (CREAM, RED, 1560, False),
          7: (NAVY, WHITE, 1480, True), 8: (WHITE, NAVY, 1460, False),
          9: (NAVY, CREAM, 1500, False), 10: (CREAM, NAVY, 1450, True),
          11: (NAVY, WHITE, 1400, False), 12: (WHITE, BLACK, 1520, True)}

# Split anchors sit right of the edge; marks shrink to fit the field.
SPLIT_ANCHORS = {1: (1730, 560, 0.62), 2: (1700, 580, 0.62),
                 3: (1690, 640, 0.62), 4: (1870, 1010, 0.62),
                 5: (1690, 560, 0.62), 6: (1710, 610, 0.62),
                 7: (1700, 580, 0.62), 8: (1690, 610, 0.62),
                 9: (1700, 735, 0.62), 10: (1700, 620, 0.62),
                 11: (1700, 600, 0.62), 12: (1700, 620, 0.62)}


# Variant-B splits: same fields, edge moved and curve flipped.
SPLITS_B = {1: (WHITE, NAVY, 1540, True), 2: (WHITE, RED, 1540, False),
            3: (NAVY, WHITE, 1500, True), 4: (CREAM, BLACK, 1540, False),
            5: (WHITE, NAVY, 1520, False), 6: (CREAM, RED, 1500, True)}
SPLIT_ANCHORS_B = {1: (1730, 680, 0.62), 2: (1710, 660, 0.62),
                   3: (1700, 700, 0.62), 4: (1860, 1010, 0.62),
                   5: (1720, 680, 0.62), 6: (1700, 700, 0.62)}


def paint_split(month, variant="A"):
    m = MOTIFS[month]
    specs = SPLITS if variant == "A" else SPLITS_B
    left, right, edge, curved = specs[month]
    img = blank(left)
    d = SSDraw(ImageDraw.Draw(img))
    if curved:
        r = 1500  # gentle arc, leftmost point at the edge
        d.ellipse([edge, 640 - r, edge + 2 * r, 640 + r], fill=right)
    else:
        d.rectangle([edge, 0, W, H], fill=right)
    color = m["accent"] if right in (WHITE, CREAM) else WHITE
    if month == 1:
        color = ORANGE  # the coin ring keeps its orange on navy
    anchors = SPLIT_ANCHORS if variant == "A" else SPLIT_ANCHORS_B
    SHAPES[m["shape"]](d, *anchors[month], color)
    return img, [left, right]


# Frame corner centres. Small margin marks: the bottom-left mark stays
# left of the logo zone, the bottom-right mark right of the footer ink.
CORNERS = {"tl": (42, 42, 1.0), "tr": (1878, 42, 1.0),
           "bl": (40, 1248, 0.9), "br": (1898, 1258, 0.7)}


def paint_frame(month, variant="A"):
    if variant == "B":
        return paint_frame_b(month)
    m = MOTIFS[month]
    ground, accent = m["ground"], m["accent"]
    img = blank(ground)
    d = SSDraw(ImageDraw.Draw(img))
    shape = m["shape"]
    if shape == "ring":
        for x, y, k in CORNERS.values():
            r = 20 * k
            d.ellipse([x - r, y - r, x + r, y + r], outline=accent, width=7)
    elif shape == "lines":
        d.rectangle([24, 28, 1896, 38], fill=accent)
        d.rectangle([24, 1242, 1690, 1252], fill=accent)
    elif shape == "squares":
        d.rectangle([20, 20, 1900, 1260], outline=accent, width=10)
        # Inner border leaves the right side open to clear the footer.
        d.line([52, 1228, 52, 52, 1868, 52], fill=accent, width=6,
               joint="miter")
        d.line([52, 1228, 1690, 1228], fill=accent, width=6)
    elif shape == "arcs":
        for (x, y, k), (a0, a1) in zip(CORNERS.values(),
                                       [(0, 90), (90, 180),
                                        (270, 360), (180, 270)]):
            r = 22 * k
            d.arc([x - r, y - r, x + r, y + r], start=a0, end=a1,
                  fill=accent, width=7)
    elif shape == "dots":
        for x in range(32, 1890, 44):
            d.ellipse([x - 7, 25, x + 7, 39], fill=accent)
            if x < 1690:  # the footer sits in the bottom gap
                d.ellipse([x - 7, 1241, x + 7, 1255], fill=accent)
        for y in range(76, 1240, 44):
            for x in (32, 1888):
                d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=accent)
    elif shape == "cross":
        for x, y, k in CORNERS.values():
            arm, w = 20 * k, 7
            d.rectangle([x - w / 2, y - arm, x + w / 2, y + arm], fill=accent)
            d.rectangle([x - arm, y - w / 2, x + arm, y + w / 2], fill=accent)
    elif shape == "rays":
        for (x, y, k), base in zip(CORNERS.values(), [45, 135, 315, 225]):
            for off in (-18, 18):
                a = math.radians(base + off)
                x1, y1 = x + math.cos(a) * 20 * k, y + math.sin(a) * 20 * k
                d.line([x, y, x1, y1], fill=accent, width=6)
    elif shape == "bars":
        d.rectangle([24, 24, 40, 1256], fill=accent)
        d.rectangle([1880, 24, 1896, 1256], fill=accent)
    elif shape == "steps":
        starts = [(38, 38), (1882, 38), (38, 1252), (1904, 1266)]
        for (x, y), (sx, sy) in zip(starts,
                                    [(1, 1), (-1, 1), (1, -1), (-1, -1)]):
            pts, px, py = [(x, y)], x, y
            for _ in range(3):
                px += sx * 6
                pts.append((px, py))
                py += sy * 6
                pts.append((px, py))
            d.line(pts, fill=accent, width=5, joint="miter")
    elif shape == "wave":
        pts = [(24 + t * 1872, 46 + np.sin(t * 24 * np.pi) * 7)
               for t in np.linspace(0, 1, 400)]
        d.line(pts, fill=accent, width=8, joint="curve")
    elif shape == "triangle":
        for x, y, k in CORNERS.values():
            s = 30 * k
            d.polygon([(x - s / 2, y - s / 3), (x + s / 2, y - s / 3),
                       (x, y + s * 0.55)], fill=accent)
    elif shape == "zigzag":
        pts = [(24 + i * 1666 / 24,
                1249 + (8 if i % 2 else -8) * (0 if i in (0, 24) else 1))
               for i in range(25)]
        d.line(pts, fill=accent, width=8, joint="curve")
    return img, [ground]


def paint_frame_b(month):
    # Second frame arrangement. Later quarters add their motifs here.
    m = MOTIFS[month]
    ground, accent = m["ground"], m["accent"]
    img = blank(ground)
    d = SSDraw(ImageDraw.Draw(img))
    if month == 1:  # rings at the edge midpoints
        for x, y in [(960, 34), (34, 640), (1886, 640), (960, 1246)]:
            d.ellipse([x - 16, y - 16, x + 16, y + 16], outline=accent,
                      width=6)
    elif month == 2:  # side rules instead of top and bottom
        d.rectangle([28, 24, 38, 1256], fill=accent)
        d.rectangle([1882, 24, 1892, 1256], fill=accent)
    elif month == 3:  # one thin border instead of two
        d.rectangle([28, 28, 1892, 1256], outline=accent, width=6)
    elif month == 4:  # quarter arcs at the edge midpoints
        for (x, y), (a0, a1) in zip([(960, 34), (34, 640), (1886, 640),
                                    (960, 1246)],
                                   [(0, 180), (270, 90),
                                    (90, 270), (180, 360)]):
            d.arc([x - 16, y - 16, x + 16, y + 16], start=a0, end=a1,
                  fill=accent, width=6)
    elif month == 5:  # dotted rules on two edges, not four
        for x in range(32, 1890, 44):
            d.ellipse([x - 7, 25, x + 7, 39], fill=accent)
        for y in range(76, 1240, 44):
            d.ellipse([25, y - 7, 39, y + 7], fill=accent)
    elif month == 6:  # plus marks at the edge midpoints
        for x, y in [(960, 34), (34, 640), (1886, 640), (960, 1246)]:
            arm, w = 20, 7
            d.rectangle([x - w / 2, y - arm, x + w / 2, y + arm], fill=accent)
            d.rectangle([x - arm, y - w / 2, x + arm, y + w / 2], fill=accent)
    else:
        raise KeyError(f"no variant-B frame for month {month}")
    return img, [ground]


PAINTERS = {"paper": paint_paper, "ink": paint_ink,
            "split": paint_split, "frame": paint_frame}

# Ink and light flags: navy grounds take the white logo and white words.
def _light_left(month, variant):
    specs = SPLITS if variant == "A" else SPLITS_B
    return specs[month][0] in (WHITE, CREAM)


def ink_of(family, month, variant="A"):
    if family == "ink":
        return "white", True
    if family == "split" and not _light_left(month, variant):
        return "white", True
    return "navy", False


def finish(img):
    return img.resize((W, H), Image.LANCZOS)


def check_zones(img, grounds, label):
    # Checked pre-downscale: exact art placement, no resampling ripple.
    a = np.array(img).astype(int)
    for name, (x0, y0, x1, y1) in ZONES.items():
        patch = a[y0 * SS:y1 * SS, x0 * SS:x1 * SS]
        ok = np.zeros(patch.shape[:2], bool)
        for g in grounds:
            ok |= (np.abs(patch - np.array(g)).max(axis=2) <= 1)
        bad = np.nonzero(~ok)
        assert not len(bad[0]), \
            f"{label}: art inside the {name} zone at " \
            f"{(x0 * SS + bad[1][0]) / SS}, {(y0 * SS + bad[0][0]) / SS}"


def save_jpg(img, path, label):
    for quality in (85, 82, 80, 75, 70):
        img.save(path, "JPEG", quality=quality, subsampling=0,
                 optimize=True)
        if os.path.getsize(path) <= MAX_BYTES:
            return quality
    raise SystemExit(f"{label}: over 150 KB even at quality 70")


def load_logo(white):
    name = "logo-white.png" if white else "logo.png"
    logo = Image.open(os.path.join(ROOT, "assets", name)).convert("RGBA")
    return logo.resize((290, 106), Image.LANCZOS)


def make_one(family, month, variant, num, outdir, logos):
    label = f"{family} {month:02d}{variant} (bg-{num:02d})"
    img, grounds = PAINTERS[family](month, variant)
    check_zones(img, grounds, label)
    final = finish(img)
    names = NAMES if variant == "A" else NAMES_B
    bg_path = os.path.join(outdir, f"bg-{num:02d}.jpg")
    q = save_jpg(final, bg_path, label)
    ink, _ = ink_of(family, month, variant)
    tpl = final.copy()
    tpl.paste(logos[ink == "white"], (96, 1085), logos[ink == "white"])
    tpl_path = os.path.join(outdir, f"tpl-{num:02d}.jpg")
    save_jpg(tpl, tpl_path, label + " thumb")
    return (num, names[(family, month)], q, os.path.getsize(bg_path))


def make_all(outdir):
    os.makedirs(outdir, exist_ok=True)
    logos = {False: load_logo(False), True: load_logo(True)}
    made = []
    for family in FAMILIES:
        for month in range(1, 13):
            made.append(make_one(family, month, "A", num_of(family, month),
                                 outdir, logos))
    for months in B_QUARTERS.values():
        for family in FAMILIES:
            for month in months:
                made.append(make_one(family, month, "B",
                                     num_of_b(family, month), outdir, logos))
    return made


def entries():
    out = []
    for family in FAMILIES:
        for month in range(1, 13):
            n = num_of(family, month)
            ink, light = ink_of(family, month, "A")
            out.append({"file": f"assets/marketing/templates/tpl-{n:02d}.jpg",
                        "bg": f"assets/marketing/templates/bg-{n:02d}.jpg",
                        "name": NAMES[(family, month)], "ink": ink,
                        "light": light, "family": family, "motif": month})
    for months in B_QUARTERS.values():
        for family in FAMILIES:
            for month in months:
                n = num_of_b(family, month)
                ink, light = ink_of(family, month, "B")
                out.append({"file": f"assets/marketing/templates/tpl-{n:02d}.jpg",
                            "bg": f"assets/marketing/templates/bg-{n:02d}.jpg",
                            "name": NAMES_B[(family, month)], "ink": ink,
                            "light": light, "family": family, "motif": month})
    return out


# Variant B for Q3 (months 7-9): July rays, August bars, September steps.
# Written as updates in one block, not edited literals, so this quarter
# merges cleanly next to Q2's variant-B rows for months 4-6. Q3 numbers
# start at bg-200: Q2 takes the numbers right after Q1 (bg-132 onward).
B_QUARTERS.update({3: [7, 8, 9]})

# Quarter bases that break the straight 12-per-quarter run (Q2 keeps it).
B_BASE_NUMS = {3: 200}

NAMES_B.update({
    ("paper", 7): "Rays low", ("ink", 7): "Night rays low",
    ("split", 7): "Ray split wide", ("frame", 7): "Ray ticks",
    ("paper", 8): "Bars low", ("ink", 8): "Night bars low",
    ("split", 8): "Bar split wide", ("frame", 8): "Short bars",
    ("paper", 9): "Steps low", ("ink", 9): "Night steps low",
    ("split", 9): "Step split wide", ("frame", 9): "Step edges",
})

# Paper/Ink B: the same motif lower and smaller, like Q1's.
ANCHORS_B.update({7: (1620, 800, 0.8), 8: (1620, 800, 0.8),
                  9: (1620, 800, 0.8)})

# Split B: same fields, edge moved right, curve flipped, like Q1's.
SPLITS_B.update({7: (NAVY, WHITE, 1540, False),
                 8: (WHITE, NAVY, 1520, True),
                 9: (NAVY, CREAM, 1560, True)})
SPLIT_ANCHORS_B.update({7: (1730, 700, 0.62), 8: (1730, 700, 0.62),
                        9: (1740, 720, 0.62)})


def paint_frame_b_q3(month):
    # Second frame arrangements for July, August and September.
    m = MOTIFS[month]
    ground, accent = m["ground"], m["accent"]
    img = blank(ground)
    d = SSDraw(ImageDraw.Draw(img))
    if month == 7:  # ray ticks across the top and bottom middles
        for x, tilt in ((920, -10), (960, 0), (1000, 10)):
            d.line([x + tilt, 24, x, 48], fill=accent, width=6)
            d.line([x, 1232, x + tilt, 1256], fill=accent, width=6)
    elif month == 8:  # short bars, top-left and bottom-left
        d.rectangle([24, 24, 320, 40], fill=accent)
        d.rectangle([24, 1240, 320, 1256], fill=accent)
    elif month == 9:  # staircases at the edge midpoints, not the corners
        for x, y, sx, sy in ((924, 24, 1, 1), (24, 604, 1, 1),
                             (1896, 604, -1, 1), (924, 1256, 1, -1)):
            pts, px, py = [(x, y)], x, y
            for _ in range(3):
                px += sx * 10
                pts.append((px, py))
                py += sy * 10
                pts.append((px, py))
            d.line(pts, fill=accent, width=5, joint="miter")
    else:
        raise KeyError(f"no Q3 variant-B frame for month {month}")
    return img, [ground]


_paint_frame_earlier = PAINTERS["frame"]


def paint_frame_q3(month, variant="A"):
    if variant == "B" and month in (7, 8, 9):
        return paint_frame_b_q3(month)
    return _paint_frame_earlier(month, variant)


PAINTERS["frame"] = paint_frame_q3


def main(argv):
    outdir = os.path.join(ROOT, "assets", "marketing", "templates")
    if "--json" in argv:
        print(json.dumps(entries(), indent=1))
        return 0
    if "--out" in argv:
        i = argv.index("--out")
        outdir = argv[i + 1] if i + 1 < len(argv) else outdir
    for n, name, q, size in make_all(outdir):
        print(f"bg-{n:02d} {name}: quality {q}, {size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
