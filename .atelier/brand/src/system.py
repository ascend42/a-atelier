"""Atelier logo system: mark, small mark, horizontal ("Atelier", the compass as
its A), vertical, badge; each in full colour, one colour and reversed on ink.

  ATELIER_BRAND_FONTS=<dir> python3 system.py ../marks
"""
import math, os, sys
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.svgPathPen import SVGPathPen
from mark import mark_parts, mark_svg, text_path, asc_height, font, INK, PAPER, ACCENT

DISPLAY = ("Fraunces", {"wght": 420, "opsz": 72, "SOFT": 50, "WONK": 0}, -0.4)
LABEL = ("Geist", {"wght": 500}, 2.2)  # tracked caps for the badge
ALTS = {"instrument": ("InstrumentSerif-Regular", None, 0.0), "geist": ("Geist", {"wght": 500}, -0.8)}

SCHEMES = {
    "": dict(ink=INK, arc=ACCENT, bg=None),
    "-mono": dict(ink=INK, arc=INK, bg=None),
    "-reversed": dict(ink=PAPER, arc=PAPER, bg=INK),
}


def svg(vb, body, bg):
    x, y, w, h = vb
    r = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.1f} {y:.1f} {w:.1f} {h:.1f}">{r}{body}</svg>'


def word(face, x, base, ink, height):
    name, axes, track = face
    size = 100 * height / asc_height(name, axes, 100)
    return text_path("atelier", name, axes, size, x, base, track * size / 10, ink)


def horizontal_telier(ink, arc, bg, face=DISPLAY):
    """The compass is the word's A: compass + 'telier' (no 'A atelier' stutter)."""
    name, axes, track = face
    size = 100 * (54.4 * 0.70) / asc_height(name, axes, 100)
    path, w = text_path("telier", name, axes, size, 47.5, 53, track * size / 10, ink)
    return svg((14, -3, 47.5 + w - 8, 62), mark_parts(ink, arc) + path, bg)


def horizontal(ink, arc, bg, face=DISPLAY):
    # wordmark baseline between the legs' shoulders and tips; ascenders 70% of the mark
    path, w = word(face, 55, 53, ink, 54.4 * 0.70)
    return svg((10, -3, 55 + w - 4, 62), mark_parts(ink, arc) + path, bg)


def vertical(ink, arc, bg):
    # word width first, so the mark centres over it
    path, w = word(DISPLAY, 0, 0, ink, 22)
    W = max(w, 60) + 16
    x0 = (W - w) / 2
    path, _ = word(DISPLAY, x0, 84, ink, 22)
    m = f'<g transform="translate({W / 2 - 32:.2f},0)">{mark_parts(ink, arc)}</g>'
    return svg((0, -3, W, 94), m + path, bg)


def ring_text(text, face, size, cx, cy, r, start_deg, track, ink):
    """Caps set clockwise around a circle, baselines on radius r, tops outward."""
    name, axes, _ = face
    ft = font(name, axes)
    gs, cmap = ft.getGlyphSet(), ft.getBestCmap()
    s = size / ft["head"].unitsPerEm
    out = []
    a = math.radians(start_deg)
    for ch in text:
        g = cmap[ord(ch)]
        adv = gs[g].width * s
        mid = a + (adv / 2) / r
        # glyph origin placed so its centre sits at angle `mid`
        ux, uy = math.cos(mid), math.sin(mid)        # outward
        tx, ty = -uy, ux                             # clockwise tangent (y down)
        bx, by = cx + ux * r, cy + uy * r            # baseline point under glyph centre
        ox, oy = bx - tx * adv / 2, by - ty * adv / 2
        pen = SVGPathPen(gs)
        # font x along tangent, font y (up) along the outward normal
        gs[g].draw(TransformPen(pen, (tx * s, ty * s, ux * s, uy * s, ox, oy)))
        out.append(pen.getCommands())
        a += (adv + track) / r
    return f'<path fill="{ink}" d="{"".join(out)}"/>'


def label(text, x0, base, size, ink):
    name, axes, track = LABEL
    return text_path(text, name, axes, size, x0, base, track * size / 10, ink)


def badge(ink, arc, bg):
    """The long story without a seal (a compass in a circle reads as a lodge emblem; round 3):
    mark, wordmark, a rule, DESIGN & CONTENT STUDIO."""
    _, ww = word(DISPLAY, 0, 0, ink, 22)
    _, lw = label("DESIGN & CONTENT STUDIO", 0, 0, 6.2, ink)
    W = max(ww, lw) + 24
    word_path, _ = word(DISPLAY, (W - ww) / 2, 84, ink, 22)
    lab, _ = label("DESIGN & CONTENT STUDIO", (W - lw) / 2, 106, 6.2, ink)
    rule = f'<path stroke="{ink}" stroke-width="1.2" d="M{(W - lw) / 2:.2f} 93.5H{(W + lw) / 2:.2f}"/>'
    m = f'<g transform="translate({W / 2 - 32:.2f},0)">{mark_parts(ink, arc)}</g>'
    return svg((0, -6, W, 120), m + word_path + rule + lab, bg)


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    w = lambda n, s: open(os.path.join(out, n), "w").write(s)
    for suf, sc in SCHEMES.items():
        w(f"mark{suf}.svg", mark_svg(sc["ink"], sc["arc"], sc["bg"]))
        w(f"mark-small{suf}.svg", mark_svg(sc["ink"], sc["arc"], sc["bg"], small=True))
        w(f"horizontal{suf}.svg", horizontal_telier(**sc))
        w(f"vertical{suf}.svg", vertical(**sc))
        w(f"badge{suf}.svg", badge(**sc))
    alt = os.path.join(out, "..", "..", "sessions-alts")
    if len(sys.argv) > 2:
        alt = sys.argv[2]
        os.makedirs(alt, exist_ok=True)
        open(os.path.join(alt, "1-fraunces.svg"), "w").write(horizontal(INK, ACCENT, None))
        open(os.path.join(alt, "4-compass-is-the-a.svg"), "w").write(horizontal_telier(INK, ACCENT, None))
        for i, (k, face) in enumerate(ALTS.items(), 2):
            open(os.path.join(alt, f"{i}-{k}.svg"), "w").write(horizontal(INK, ACCENT, None, face))
    print("ok")
