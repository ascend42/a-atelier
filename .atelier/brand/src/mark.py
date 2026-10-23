"""Atelier mark, round 3: geometry and wordmark outlines.

The A is a drafting compass. Its crossbar is an arc centred on the hinge,
so the bar is the compass's own sweep; it stops at the legs.
"""
import math, sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

# The OFL fonts aren't committed (the SVGs are outlined). To regenerate, put
# Fraunces.ttf, Geist.ttf (variable, from github.com/google/fonts) in $ATELIER_BRAND_FONTS.
FONTS = os.environ.get("ATELIER_BRAND_FONTS", os.path.join(os.path.dirname(__file__), "fonts"))
INK, PAPER, ACCENT = "#1d1c1a", "#f6f3ee", "#c2410c"

P = (32.0, 12.0)          # hinge
LEG_W = 4.6
ARC_W = 4.0
R = 29.0                  # sweep radius from the hinge


def f(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def leg(side, w=None, hit_y=32.5):
    c0 = (P[0] + side * 1.5, 15.0)
    c1 = (P[0] + side * 11.0, 48.0)
    dx, dy = c1[0] - c0[0], c1[1] - c0[1]
    L = math.hypot(dx, dy)
    d = (dx / L, dy / L)
    n = (d[1], -d[0])
    h = (w or LEG_W) / 2
    tip = (c1[0] + d[0] * 7.5, c1[1] + d[1] * 7.5)
    pts = [(c0[0] + n[0] * h, c0[1] + n[1] * h), (c1[0] + n[0] * h, c1[1] + n[1] * h), tip,
           (c1[0] - n[0] * h, c1[1] - n[1] * h), (c0[0] - n[0] * h, c0[1] - n[1] * h)]
    # where the crossbar meets the leg's centreline
    t = (hit_y - c0[1]) / d[1]
    hit = (c0[0] + d[0] * t, hit_y)
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z", hit


SAG = 3.6


def mark_parts(ink=INK, arc=None, small=False):
    """small: the 16-24px form. Heavier legs and bar, no handle, one colour
    (a thin accent band blurs to brown at 16px), a hinge no wider than the legs."""
    arc = ink if small else (arc or ink)
    lw, aw = (6.6, 6.0) if small else (LEG_W, ARC_W)
    lp, lh = leg(-1, lw)
    rp, rh = leg(1, lw)
    half = (rh[0] - lh[0]) / 2
    r = (half * half + SAG * SAG) / (2 * SAG)
    sweep = f'<path fill="none" stroke="{arc}" stroke-width="{aw}" d="M{f(lh[0])} {f(lh[1])}A{f(r)} {f(r)} 0 0 0 {f(rh[0])} {f(rh[1])}"/>'
    handle = "" if small else f'<path fill="none" stroke="{ink}" stroke-width="3" stroke-linecap="round" d="M32 2.5v5"/>'
    return (sweep
            + f'<path fill="{ink}" d="{lp}{rp}"/>'
            + handle
            + (f'<path fill="{ink}" d="M28.6 9.5h6.8l2.4 8h-11.6z"/>' if small else f'<circle cx="32" cy="{f(P[1])}" r="4" fill="{ink}"/>'))


# mark's drawn extent inside its 64 box
MARK_TOP, MARK_BOTTOM = 1.0, 55.4


# tight square frame around the drawn mark (x 17.5-46.5, y 1-55.5)
FRAME = (4, 0.5, 56, 56)


def mark_svg(ink=INK, arc=None, bg=None, small=False):
    x, y, w, h = (6, 5, 52, 52) if small else FRAME
    bgr = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}">{bgr}{mark_parts(ink, arc, small)}</svg>'


_cache = {}


def font(name, axes=None):
    key = (name, tuple(sorted((axes or {}).items())))
    if key not in _cache:
        ft = TTFont(os.path.join(FONTS, name + ".ttf"))
        if axes and "fvar" in ft:
            ft = instancer.instantiateVariableFont(ft, axes)
        _cache[key] = ft
    return _cache[key]


def kern_pairs(ft):
    """Pair kerning from GPOS PairPos format 1 and 2 (enough for a wordmark)."""
    pairs = {}
    if "GPOS" not in ft:
        return pairs
    for lookup in ft["GPOS"].table.LookupList.Lookup:
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                st = st.ExtSubTable
            if getattr(st, "LookupType", lookup.LookupType) != 2:
                continue
            cov = st.Coverage.glyphs
            if st.Format == 1:
                for i, g1 in enumerate(cov):
                    for pvr in st.PairSet[i].PairValueRecord:
                        v = pvr.Value1.XAdvance if pvr.Value1 and hasattr(pvr.Value1, "XAdvance") else 0
                        pairs.setdefault((g1, pvr.SecondGlyph), v or 0)
            elif st.Format == 2:
                c1, c2 = st.ClassDef1.classDefs, st.ClassDef2.classDefs
                for g1 in cov:
                    k1 = c1.get(g1, 0)
                    rec = st.Class1Record[k1]
                    for g2, k2 in list(c2.items()):
                        v = rec.Class2Record[k2].Value1
                        x = getattr(v, "XAdvance", 0) if v else 0
                        if x:
                            pairs.setdefault((g1, g2), x)
    return pairs


def text_path(text, name, axes, size, x0, baseline, track=0.0, fill=INK):
    """Outline `text` at `size` px; returns (svg path element, advance width, cap/asc metrics)."""
    ft = font(name, axes)
    gs = ft.getGlyphSet()
    cmap = ft.getBestCmap()
    upm = ft["head"].unitsPerEm
    s = size / upm
    kp = kern_pairs(ft)
    x = 0.0
    d = []
    names = [cmap[ord(ch)] for ch in text]
    for i, g in enumerate(names):
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x0 + x, baseline)))
        d.append(pen.getCommands())
        x += gs[g].width * s + track
        if i + 1 < len(names):
            x += kp.get((g, names[i + 1]), 0) * s
    x -= track
    return f'<path fill="{fill}" d="{"".join(d)}"/>', x


def text_bounds(text, name, axes, size):
    ft = font(name, axes)
    gs = ft.getGlyphSet()
    cmap = ft.getBestCmap()
    s = size / ft["head"].unitsPerEm
    bp = BoundsPen(gs)
    x = 0
    for ch in text:
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(bp, (s, 0, 0, s, x, 0)))
        x += gs[g].width * s
    return bp.bounds  # xMin, yMin, xMax, yMax (y up)


def asc_height(name, axes, size):
    """Height of the 'l' ascender at this size (the wordmark's tallest letter)."""
    return text_bounds("l", name, axes, size)[3]


if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "mark.svg"), "w").write(mark_svg())
    open(os.path.join(out, "mark-small.svg"), "w").write(mark_svg(small=True))
    print("ok")
