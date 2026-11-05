#!/usr/bin/env python3
"""2027 card renderer: month files to finished cards, same layout as the editor.

Reads assets/marketing/2027-MM.json (each post carries headline, subline,
bg) and draws every card: the background from templates.json, the headline
in Bricolage Grotesque 800, the subline in Figtree 600, the logo at the
editor position and the altradits.com footer. Re-render a month after
editing copy with:

  python3 deploy/mkt-render.py 2027-01

Render-time checks fail loudly: headline line count and fit, subline fit,
text inside the margins and clear of the logo, headline contrast 4.5:1 and
subline contrast 3:1 (large text, WCAG AA), dimensions 1920x1280, each file
under 150 KB. Deterministic: fixed fonts, layout and JPEG settings.

Needs: pillow, numpy (pip install pillow numpy).
"""
import json
import os
import sys

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("mkt-render needs pillow and numpy: pip install pillow numpy")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1920, 1280
SS = 2  # text is drawn supersampled, then composited crisp
MAX_BYTES = 150 * 1024

NAVY = (15, 27, 45)
WHITE = (255, 255, 255)
RED = (234, 81, 88)
GREY = (154, 154, 155)

HEAD_X, HEAD_TOP, HEAD_W = 96, 320, 1152
HEAD_MIN, HEAD_MAX = 120, 170
SUB_GAP, SUB_SIZE = 48, 56
LOGO_X, LOGO_Y, LOGO_W, LOGO_H = 96, 1085, 290, 106
FOOT_TEXT, FOOT_SIZE, FOOT_RIGHT, FOOT_BASE = "altradits.com", 24, 1874, 1238
TEXT_BOTTOM_MAX = 1016

FONTS = {}


def font(path, size, weight):
    key = (path, size, weight)
    if key not in FONTS:
        f = ImageFont.truetype(os.path.join(ROOT, "assets", path), size * SS)
        f.set_variation_by_axes([weight])
        FONTS[key] = f
    return FONTS[key]


def bric(size, weight=800):
    return font("bricolage-grotesque-latin.woff2", size, weight)


def btc(size, weight):
    # The Bitcoin sign lives in the site's own Bricolage latin-ext font.
    return font("bricolage-grotesque-latin-ext.woff2", size, weight)


def fig(size, weight=600):
    return font("figtree-latin.woff2", size, weight)


def rel_lum(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    a, b = rel_lum(fg), rel_lum(bg)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def ground_of(bg_img):
    # The text zone is flat ground by construction; sample it, don't guess.
    a = np.array(bg_img).astype(int)
    patches = [a[y:y + 40, x:x + 40] for x, y in
               [(100, 100), (1100, 100), (100, 950), (1100, 950), (600, 500)]]
    return tuple(int(v) for v in np.median(np.vstack([p.reshape(-1, 3) for p in patches]), axis=0))


def track_len(text, f, bf, track):
    w, n = 0, 0
    for ch in text:
        w += (bf if ch == "\u20bf" else f).getlength(ch)
        n += 1
    return w + track * max(0, n - 1)


def break_headline(words, f, bf, track, maxw, size):
    # Every 1-3 line split, no orphan last line; keep the most balanced.
    widths = [track_len(w, f, bf, track) for w in words]
    space = track_len(" ", f, bf, track)
    cands = []
    n = len(words)
    for nlines in (1, 2, 3):
        if nlines > n:
            continue
        for splits in _splits(n, nlines):
            lines, start = [], 0
            for end in splits:
                lines.append((start, end))
                start = end
            ok, wmax = True, 0
            for s, e in lines:
                if nlines > 1 and e == n and e - s < 2:
                    ok = False  # single-word last line
                    break
                w = sum(widths[s:e]) + space * (e - s - 1)
                if w > maxw:
                    ok = False
                    break
                wmax = max(wmax, w)
            if ok:
                cands.append((nlines, wmax, lines))
    assert cands, f"headline needs over 3 lines at {size}px"
    cands.sort()
    _, _, lines = cands[0]
    return [" ".join(words[s:e]) for s, e in lines]


def _splits(n, nlines):
    if nlines == 1:
        yield [n]
        return
    def rec(start, left, acc):
        if left == 1:
            yield acc + [n]
            return
        for end in range(start + 1, n - left + 2):
            yield from rec(end, left - 1, acc + [end])
    yield from rec(0, nlines, [])


def wrap_sub(words, f, bf, track, maxw):
    lines, cur, curw = [], [], 0.0
    space = track_len(" ", f, bf, track)
    for w in words:
        ww = track_len(w, f, bf, track)
        add = ww if not cur else space + ww
        if cur and curw + add > maxw:
            lines.append(" ".join(cur))
            cur, curw = [w], ww
        else:
            cur.append(w)
            curw += add
    if cur:
        lines.append(" ".join(cur))
    assert len(lines) <= 2, "subline needs over 2 lines, shorten it"
    return lines


def draw_tracked(d, x, base, line, f, bf, fill, track):
    for ch in line:
        ff = bf if ch == "\u20bf" else f
        d.text((x, base), ch, font=ff, fill=fill, anchor="ls")
        x += ff.getlength(ch) + track
    return x


def load_logo(white):
    name = "logo-white.png" if white else "logo.png"
    logo = Image.open(os.path.join(ROOT, "assets", name)).convert("RGBA")
    return logo.resize((LOGO_W, LOGO_H), Image.LANCZOS)


def save_jpg(img, path, label):
    for quality in (85, 82, 80, 75, 70):
        img.save(path, "JPEG", quality=quality, subsampling=0,
                 optimize=True)
        if os.path.getsize(path) <= MAX_BYTES:
            return quality
    raise SystemExit(f"{label}: over 150 KB even at quality 70")


def render(post, tpls, logos, outdir):
    label = post["date"]
    words = post["headline"].split()
    assert 1 <= len(words) <= 8, f"{label}: headline is {len(words)} words, max 8"
    sub = post.get("subline") or ""
    swords = sub.split()
    assert len(swords) <= 14, f"{label}: subline is {len(swords)} words, max 14"
    tpl = tpls.get(post["bg"])
    assert tpl, f"{label}: unknown background {post['bg']}"
    dark = tpl["light"] is True
    head_color = WHITE if dark else NAVY

    bg = Image.open(os.path.join(ROOT, post["bg"])).convert("RGB")
    assert bg.size == (W, H), f"{label}: background is {bg.size}, want 1920x1280"
    ground = ground_of(bg)
    assert contrast(head_color, ground) >= 4.5, \
        f"{label}: headline contrast {contrast(head_color, ground):.2f}, want 4.5"

    sub_color = RED
    if contrast(sub_color, ground) < 3.0:
        sub_color = head_color
    assert contrast(sub_color, ground) >= 3.0, \
        f"{label}: subline contrast {contrast(sub_color, ground):.2f}, want 3.0"

    maxw = HEAD_W * SS
    lines, size = None, HEAD_MAX
    while size >= HEAD_MIN:
        f, bf = bric(size), btc(size, 800)
        track = -0.015 * size * SS
        try:
            lines = break_headline(words, f, bf, track, maxw, size)
            break
        except AssertionError:
            size -= 4
    assert lines, f"{label}: headline does not fit even at {HEAD_MIN}px"
    f, bf = bric(size), btc(size, 800)
    track = -0.015 * size * SS
    step = round(size * 1.02 / 8) * 8 * SS
    asc, desc = f.getmetrics()
    base = HEAD_TOP * SS + asc
    bottom = base + (len(lines) - 1) * step

    sublines = []
    if swords:
        sf, sbf = fig(SUB_SIZE), btc(SUB_SIZE, 600)
        strack = -0.01 * SUB_SIZE * SS
        sublines = wrap_sub(swords, sf, sbf, strack, maxw)
        sstep = round(SUB_SIZE * 1.25 / 8) * 8 * SS
        sasc, sdesc = sf.getmetrics()
        sbase = bottom + desc + SUB_GAP * SS + sasc
        bottom = sbase + (len(sublines) - 1) * sstep + sdesc
    assert bottom / SS <= TEXT_BOTTOM_MAX, \
        f"{label}: text runs to y{bottom / SS:.0f}, want clear of the logo"

    layer = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    b = base
    for line in lines:
        draw_tracked(d, HEAD_X * SS, b, line, f, bf, head_color, track)
        b += step
    if sublines:
        b = sbase
        for line in sublines:
            draw_tracked(d, HEAD_X * SS, b, line, sf, sbf, sub_color, strack)
            b += sstep
    ff = fig(FOOT_SIZE, 400)
    fw = ff.getlength(FOOT_TEXT)
    d.text((FOOT_RIGHT * SS - fw, FOOT_BASE * SS), FOOT_TEXT, font=ff,
           fill=GREY, anchor="ls")

    card = bg.convert("RGBA")
    card.alpha_composite(layer.resize((W, H), Image.LANCZOS))
    white_logo = tpl["ink"] == "white"
    card.paste(logos[white_logo], (LOGO_X, LOGO_Y), logos[white_logo])
    final = card.convert("RGB")
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, os.path.basename(post["image"]))
    q = save_jpg(final, path, label)
    return {"size": size, "lines": len(lines), "sub": len(sublines),
            "quality": q, "bytes": os.path.getsize(path),
            "contrast": round(contrast(head_color, ground), 2)}


def main(argv):
    if len(argv) != 2 or not argv[1].startswith("2027-"):
        sys.exit("usage: python3 deploy/mkt-render.py 2027-MM")
    month = argv[1]
    with open(os.path.join(ROOT, "assets", "marketing", f"{month}.json"),
              encoding="utf-8") as fh:
        data = json.load(fh)
    tpls = {t["bg"]: t for t in
            json.load(open(os.path.join(ROOT, "assets", "marketing",
                                        "templates.json"), encoding="utf-8"))}
    logos = {False: load_logo(False), True: load_logo(True)}
    outdir = os.path.join(ROOT, "assets", "marketing", month)
    for p in data["posts"]:
        r = render(p, tpls, logos, outdir)
        print(f"{p['date']} {p['type']}: head {r['size']}px/{r['lines']}ln "
              f"sub {r['sub']}ln q{r['quality']} {r['bytes'] // 1024}KB "
              f"c{r['contrast']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
