#!/usr/bin/env python3
"""Marketing art check: every scheduled image is visible and the logo stands clear.

Discovery follows assets/marketing/months.json plus templates.json, so new
months, new templates and new file locations are picked up with no code
change. Explicit paths may also
be given to check new art before it ships:
  python3 deploy/art-check.py [FILE ...]
  python3 deploy/art-check.py --self-test   (prove the checker itself)
Needs: pillow, numpy (pip install pillow numpy). Videos need ffmpeg.

Fails (exit 1) on a definite logo/text collision, calibrated on dec-07 and
dec-17 (both failed before their fix, pass after):
- ink unbroken from the logo into the headline zone (touch/art overlap), or
- a sub-12px gap to a foreign neighbour across 15+ rows.
Warns (exit 0) on tight spacing a human should eyeball: gaps under 40px,
clearance above the logo under 12px, videos ffmpeg cannot inspect.
Navy grounds (the Minimal 2027 Ink family and navy-left splits) run the
same geometry on a bright mask: the white logo must stand clear of light
neighbours. Ground darkness comes from the image median, not the filename.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit("art-check needs pillow and numpy: pip install pillow numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAIL_GAP, FAIL_ROWS = 12, 15
WARN_GAP, WARN_ABOVE = 40, 12
VIDEO_EXTS = (".mp4", ".mov", ".webm", ".m4v")


def masks(rgb):
    a = np.array(rgb).astype(int)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    navy = (R < 100) & (G < 130) & (B < 170) & (B > R + 10)
    red = (R > 140) & (G < 130) & (B < 130)
    return navy | red


def bright(rgb):
    a = np.array(rgb).astype(int)
    R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    return (R > 150) & (G > 150) & (B > 150)


def dark_ground(img):
    small = np.array(img.resize((192, 128))).astype(int)
    med = np.median(small.reshape(-1, 3), axis=0)
    lum = 0.2126 * med[0] + 0.7152 * med[1] + 0.0722 * med[2]
    return lum < 90


def check_image(path, label):
    """Returns (fails, warns) as message lists."""
    fails, warns = [], []
    try:
        img = Image.open(path).convert("RGB")
        img.load()
    except Exception as e:
        return [f"{label}: unreadable image ({e})"], []
    if min(img.size) < 200:
        return [f"{label}: {img.size[0]}x{img.size[1]}px is too small to post"], []
    dark = dark_ground(img)
    ink = bright(img) if dark else masks(img)
    H, W = ink.shape
    if W <= 700:
        return [f"{label}: {img.size[0]}px wide, too narrow for the logo lockup"], []
    # November's template carries a full-height red bar at the left edge
    # (~170px); it is intentional design, not an intruder: find where it
    # ends and measure right of it. (December dropped the bar; x0 stays 0.
    # Navy grounds never carry the bar.)
    x0 = 0
    if not dark:
        colfill = ink[100:1200, :210].sum(axis=0)
        while x0 < 200 and colfill[x0] > 800:
            x0 += 1
    # Logo rows carry the logo's fixed left edge: a substantial ink run
    # starting there ("Al": x95 December; x140 November, tucked to its
    # bar). Thin fringe and far-left headlines never qualify, and rows
    # with only art or headline ink never qualify.
    alo, ahi = (70, 150) if x0 < 70 else (x0 - 30, x0 + 10)
    logo_rows = []
    for y in range(1000, min(H, 1260)):
        d = np.diff(ink[y].astype(int), prepend=0, append=0)
        starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
        if any(alo <= s <= ahi and e - s >= 10 for s, e in zip(starts, ends)):
            logo_rows.append(y)
    if not logo_rows:
        return [f"{label}: no logo found in the bottom-left corner"], []
    top = min(logo_rows)
    bridged, gaps = 0, []
    for y in logo_rows:
        row = ink[y]
        d = np.diff(row.astype(int), prepend=0, append=0)
        starts, ends = np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]
        runs = list(zip(starts, ends))
        seg = ink[y, 400:651]
        if seg.any():
            d2 = np.diff(seg.astype(int), prepend=1, append=1)
            v0, v1 = np.nonzero(d2 == -1)[0], np.nonzero(d2 == 1)[0]
            if max((e - s for s, e in zip(v0, v1)), default=0) < 3:
                bridged += 1  # ink unbroken from the logo into headline zone
                continue
        # The gap right of the logo's last piece ("s"/swoosh): the run right
        # of it must be foreign, i.e. connected upward past the logo's top
        # (headlines and panels are; neighbouring logo pieces and detached
        # ripple lines are not).
        lo, hi = (340, 400) if y <= top + 55 else (300, 420)
        for (s1, e1), (s2, e2) in zip(runs, runs[1:]):
            if not (lo <= e1 <= hi and s2 < 900 and s2 - e1 >= 3):
                continue
            band = ink[:, s2:min(W, s2 + 20)].any(axis=1)
            a = y
            while a > 0 and band[a - 1]:
                a -= 1
            if a <= top - 15:
                gaps.append(int(s2 - e1))
                break
    if bridged >= 3:
        fails.append(f"{label}: logo touches its neighbour ({bridged} rows)")
    mingap = min(gaps) if gaps else None
    if mingap is not None and mingap < FAIL_GAP and len(gaps) >= FAIL_ROWS:
        fails.append(f"{label}: logo gap is {mingap}px over {len(gaps)} rows")
    elif mingap is not None and mingap < WARN_GAP:
        warns.append(f"{label}: tight logo gap ({mingap}px), eyeball it")
    # Climb to the true cap tops through ink overlapping the logo body
    # below (apex tips qualify; detached fringe and offset intruders stop
    # the climb); then look for a solid intruder mass above that.
    xlo = max(90, x0)
    apex = top
    cols = ink[top, xlo:350]
    while apex - 1 >= top - 40:
        above = ink[apex - 1, xlo:350]
        if (above & cols).sum() < 3:
            break
        cols |= above
        apex -= 1
    span = ink[850:max(apex - 4, 851), xlo:350]
    rows = np.nonzero(span.sum(axis=1) >= 10)[0]
    if len(rows):
        low = 850 + rows.max()
        a = low
        while a - 1 >= 850 and ink[a - 1, xlo:350].sum() >= 3:
            a -= 1
        mass = ink[a:low + 1, xlo:350].sum(axis=1)
        if low - a + 1 >= 6 and np.median(mass) >= 12 and apex - low < WARN_ABOVE:
            warns.append(f"{label}: only {apex - low}px above the logo, eyeball it")
    return fails, warns


def poster_of(path, tmp):
    if not shutil.which("ffmpeg"):
        return None
    out = os.path.join(tmp, "poster.png")
    r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", "1", "-i", path,
                        "-frames:v", "1", out], capture_output=True)
    return out if r.returncode == 0 and os.path.exists(out) else None


def discover():
    mpath = os.path.join(ROOT, "assets", "marketing", "months.json")
    with open(mpath, encoding="utf-8") as f:
        months = json.load(f)
    found = []
    for m in months:
        with open(os.path.join(ROOT, "assets", "marketing", f"{m}.json"), encoding="utf-8") as f:
            data = json.load(f)
        for i, p in enumerate(data.get("posts", [])):
            for key in ("image", "video"):
                if p.get(key):
                    found.append((os.path.join(ROOT, p[key]), f"{m} post {i + 1} {key}"))
    tpath = os.path.join(ROOT, "assets", "marketing", "templates.json")
    if os.path.exists(tpath):
        with open(tpath, encoding="utf-8") as f:
            for t in json.load(f):
                found.append((os.path.join(ROOT, t["file"]), f"template {t.get('name', '?')}"))
    return found


def self_test():
    """Synthetic fixtures (rectangles obey the same run logic as letters)."""
    cases = []

    def make(logo=True, neighbour=None, ny=(1050, 1160)):
        a = np.full((1280, 1920, 3), 255, np.uint8)
        if logo:
            a[1084:1131, 95:387] = (90, 120, 160)
        if neighbour:
            x0, x1 = neighbour
            a[ny[0]:ny[1], x0:x1] = (15, 30, 80)
        return Image.fromarray(a)

    def make_dark(logo=True, neighbour=None, ny=(1050, 1160)):
        a = np.full((1280, 1920, 3), (15, 27, 45), np.uint8)
        if logo:
            a[1084:1131, 95:387] = (245, 245, 245)
        if neighbour:
            x0, x1 = neighbour
            a[ny[0]:ny[1], x0:x1] = (250, 250, 250)
        return Image.fromarray(a)

    with tempfile.TemporaryDirectory() as tmp:
        clean = os.path.join(tmp, "clean.png")
        make(neighbour=(500, 700)).save(clean)
        cases.append((clean, 0, 0))
        bridge = os.path.join(tmp, "bridge.png")
        make(neighbour=(300, 700), ny=(1084, 1194)).save(bridge)
        cases.append((bridge, 1, 0))
        narrow = os.path.join(tmp, "narrow.png")
        make(neighbour=(393, 600)).save(narrow)
        cases.append((narrow, 1, 0))
        tight = os.path.join(tmp, "tight.png")
        make(neighbour=(407, 600)).save(tight)
        cases.append((tight, 0, 1))
        dclean = os.path.join(tmp, "dclean.png")
        make_dark(neighbour=(500, 700)).save(dclean)
        cases.append((dclean, 0, 0))
        dbridge = os.path.join(tmp, "dbridge.png")
        make_dark(neighbour=(300, 700), ny=(1084, 1194)).save(dbridge)
        cases.append((dbridge, 1, 0))
        dnarrow = os.path.join(tmp, "dnarrow.png")
        make_dark(neighbour=(393, 600)).save(dnarrow)
        cases.append((dnarrow, 1, 0))
        dtight = os.path.join(tmp, "dtight.png")
        make_dark(neighbour=(407, 600)).save(dtight)
        cases.append((dtight, 0, 1))
        blank = os.path.join(tmp, "blank.png")
        make(logo=False).save(blank)
        cases.append((blank, 1, 0))
        bad = os.path.join(tmp, "bad.jpg")
        open(bad, "w").write("not an image")
        cases.append((bad, 1, 0))
        failed = 0
        for path, want_f, want_w in cases:
            f, w = check_image(path, os.path.basename(path))
            ok = len(f) == want_f and len(w) == want_w
            failed += not ok
            print(f"{'ok' if ok else 'MISMATCH'} {os.path.basename(path)}: "
                  f"fails={len(f)} warns={len(w)} (want {want_f}/{want_w}) {f + w}")
    print("self-test: " + ("PASS" if not failed else f"{failed} MISMATCHES"))
    return 1 if failed else 0


def main(argv):
    if len(argv) == 2 and argv[1] == "--self-test":
        return self_test()
    if argv[1:]:
        targets = [((a if os.path.isabs(a) else os.path.abspath(a)), a, False) for a in argv[1:]]
    else:
        try:
            targets = [(p, label, True) for p, label in discover()]
        except FileNotFoundError as e:
            sys.exit(f"art-check: cannot discover assets ({e})")
    fails, warns = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for path, label, confined in targets:
            real = os.path.realpath(path)
            if not os.path.isfile(real):
                fails.append(f"{label}: {path} is missing")
                continue
            if confined and os.path.commonpath([ROOT, real]) != ROOT:
                fails.append(f"{label}: {path} escapes the site")
                continue
            if path.lower().endswith(VIDEO_EXTS):
                poster = poster_of(real, tmp)
                if poster is None:
                    warns.append(f"{label}: video not inspected (ffmpeg missing)")
                    continue
                f, w = check_image(poster, label + " poster")
            else:
                f, w = check_image(real, label)
            fails.extend(f)
            warns.extend(w)
    for m in fails + warns:
        print(("FAIL " if m in fails else "warn ") + m)
    print(f"art-check: {len(targets)} assets, {len(fails)} failures, {len(warns)} warnings")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
