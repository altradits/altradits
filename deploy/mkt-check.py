#!/usr/bin/env python3
"""2027 marketing checks and review contact sheets.

Verifies the shipped 2027 months: complete days in order, rhythm types,
copy lengths and tags, unique headlines and captions (also against the
2026 schedule), background limits (no repeat days, max 6 per month, motif
matches the month), and image files (1920x1280, under 150 KB). Builds
contact sheets for human review: a 7-column calendar grid, a 400 px
thumbnail grid, and centre 16:9 crops.

Usage:
  python3 deploy/mkt-check.py                 # check + sheets to /tmp/mkt2027-review
  python3 deploy/mkt-check.py --out DIR       # sheets to DIR instead
  python3 deploy/mkt-check.py --no-sheets     # checks only

Layout guarantees (text in margins, contrast, headline line count) are
asserted at render time by deploy/mkt-render.py, which fails loudly; this
script checks what is verifiable from the shipped files.

Needs: pillow, numpy (pip install pillow numpy).
"""
import datetime
import json
import os
import re
import sys
import unicodedata
from collections import Counter

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("mkt-check needs pillow and numpy: pip install pillow numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MKT = os.path.join(ROOT, "assets", "marketing")
MAX_BYTES = 150 * 1024
RHYTHM = {"Mon": "Lesson", "Tue": "Tip", "Wed": "Ye₿ente",
          "Thu": "Myth vs fact", "Fri": "Story", "Sat": "Question",
          "Sun": "Ye₿ente"}
TYPES = set(RHYTHM.values())


def norm(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", s).lower().strip())


def load_month(m):
    with open(os.path.join(MKT, f"{m}.json"), encoding="utf-8") as fh:
        return json.load(fh)


def check():
    fails = []
    months = json.load(open(os.path.join(MKT, "months.json"), encoding="utf-8"))
    tpls = {t["bg"]: t for t in
            json.load(open(os.path.join(MKT, "templates.json"), encoding="utf-8"))}
    data = {m: load_month(m) for m in months}

    caps26 = {norm(p["caption"]) for m, d in data.items()
              if m.startswith("2026-") for p in d["posts"]}
    words26 = {norm(p["alt"].split(":", 1)[1]) for m, d in data.items()
               if m.startswith("2026-") for p in d["posts"] if ":" in p["alt"]}
    heads27, caps27 = {}, {}
    months27 = sorted(m for m in months if m.startswith("2027-"))

    for m in months27:
        d = data[m]
        assert re.fullmatch(r"#\w+", d["tag"]), f"{m}: bad month tag"
        y, mo = int(m[:4]), int(m[5:])
        ndays = (datetime.date(y + (mo == 12), mo % 12 + 1, 1) -
                 datetime.timedelta(days=1)).day
        want = [f"{m}-{day:02d}" for day in range(1, ndays + 1)]
        if [p["date"] for p in d["posts"]] != want:
            fails.append(f"{m}: days are not complete and in order")
            continue
        prev, use = None, Counter()
        for p in d["posts"]:
            w = p["date"]
            wd = datetime.date(y, mo, int(w[8:])).strftime("%a")
            if p.get("type") not in TYPES:
                fails.append(f"{w}: type {p.get('type')!r} is not one of the six")
            elif p["type"] != RHYTHM[wd]:
                fails.append(f"{w}: type {p['type']} breaks the rhythm ({wd} is {RHYTHM[wd]})")
            h, s = p.get("headline", ""), p.get("subline", "")
            if not (1 <= len(h.split()) <= 8):
                fails.append(f"{w}: headline is {len(h.split())} words, want 1-8")
            if len(s.split()) > 14:
                fails.append(f"{w}: subline is {len(s.split())} words, max 14")
            if len(p["caption"]) >= 240:
                fails.append(f"{w}: caption is {len(p['caption'])} chars, max 239")
            if not (p["alt"] and len(p["alt"]) < 200):
                fails.append(f"{w}: alt text is missing or 200+ chars")
            for k in ("headline", "subline", "caption", "alt"):
                if "\u2014" in p.get(k, ""):
                    fails.append(f"{w}: em-dash in {k}")
            if "#Altradits" not in p["caption"] or d["tag"] not in p["caption"]:
                fails.append(f"{w}: caption misses a tag")
            nh = norm(h)
            if nh in heads27:
                fails.append(f"{w}: headline repeats {heads27[nh]}")
            elif nh in words26:
                fails.append(f"{w}: headline repeats 2026 card words")
            else:
                heads27[nh] = w
            nc = norm(p["caption"])
            if nc in caps27:
                fails.append(f"{w}: caption repeats {caps27[nc]}")
            elif nc in caps26:
                fails.append(f"{w}: caption repeats a 2026 caption")
            else:
                caps27[nc] = w
            t = tpls.get(p.get("bg", ""))
            if not t:
                fails.append(f"{w}: unknown background {p.get('bg')}")
            else:
                if t.get("motif") != mo:
                    fails.append(f"{w}: {p['bg']} motif is month {t.get('motif')}, want {mo}")
                if p["bg"] == prev:
                    fails.append(f"{w}: same background as yesterday")
                use[p["bg"]] += 1
            prev = p.get("bg")
            full = os.path.join(ROOT, p["image"])
            if not os.path.isfile(full):
                fails.append(f"{w}: {p['image']} is missing")
                continue
            if os.path.getsize(full) > MAX_BYTES:
                fails.append(f"{w}: {os.path.getsize(full)} bytes, over 150 KB")
            with Image.open(full) as im:
                if im.size != (1920, 1280):
                    fails.append(f"{w}: {im.size}, want 1920x1280")
        for bg, c in sorted(use.items()):
            if c > 6:
                fails.append(f"{m}: {bg} used {c}x, max 6")
        print(f"{m}: {len(d['posts'])} posts, "
              f"{len(use)} backgrounds (max {max(use.values())}x)")
    return fails, months27


def sheets(months, outdir):
    os.makedirs(outdir, exist_ok=True)
    for m in months:
        d = load_month(m)
        paths = [os.path.join(ROOT, p["image"]) for p in d["posts"]]
        y, mo = int(m[:4]), int(m[5:])
        lead = (datetime.date(y, mo, 1).weekday()) % 7  # Monday-first grid
        cal_sheet(m, paths, lead, outdir)
        thumb_sheet(m, paths, outdir, crop169=False)
        thumb_sheet(m, paths, outdir, crop169=True)
    print(f"sheets in {outdir}")


def cal_sheet(m, paths, lead, outdir):
    tw, th, pad = 260, 173, 8
    cols = 7
    cells = [None] * lead + paths
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + pad) + pad,
                              rows * (th + 26 + pad) + pad), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, p in enumerate(cells):
        x = pad + (i % cols) * (tw + pad)
        y = pad + (i // cols) * (th + 26 + pad)
        if p is None:
            continue
        sheet.paste(Image.open(p).convert("RGB").resize((tw, th), Image.LANCZOS), (x, y))
        d.text((x + 4, y + th + 5), os.path.basename(p)[:6], fill=(80, 80, 80))
    sheet.save(os.path.join(outdir, f"{m}-cal.jpg"), quality=88)


def thumb_sheet(m, paths, outdir, crop169):
    tw = 400
    th = 225 if crop169 else 267
    cols = 6
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + 8) + 8, rows * (th + 8) + 8),
                      (255, 255, 255))
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGB")
        if crop169:
            im = im.crop((0, 100, 1920, 1180))  # centre 1920x1080
        im = im.resize((tw, th), Image.LANCZOS)
        sheet.paste(im, (8 + (i % cols) * (tw + 8), 8 + (i // cols) * (th + 8)))
    tag = "crop169" if crop169 else "thumb400"
    sheet.save(os.path.join(outdir, f"{m}-{tag}.jpg"), quality=88)


def main(argv):
    fails, months27 = check()
    for f in fails:
        print("FAIL " + f)
    print(f"mkt-check: {len(months27)} months, {len(fails)} failures")
    if fails:
        return 1
    if "--no-sheets" not in argv:
        outdir = "/tmp/mkt2027-review"
        if "--out" in argv:
            i = argv.index("--out")
            outdir = argv[i + 1] if i + 1 < len(argv) else outdir
        sheets(months27, outdir)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
