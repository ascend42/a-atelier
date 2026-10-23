"""Atelier reveal: the motion showcase, written as an .atelier document.

The compass lands, the pencil leg swings open while the vermilion arc draws
the A's crossbar, "telier" rises in letter by letter to finish the word, the
tagline settles beneath, and the lockup drifts smaller through the end hold.

  ATELIER_BRAND_FONTS=<dir> python3 reveal.py ../motion
  cd ../motion && atelier render reveal.atelier -o reveal.mp4 && atelier render-check reveal.mp4 --expect 3.8

Render from motion/: asset paths are relative, and the CLI resolves them
against the working directory, not the .atelier file.

Timing and curves follow atelier-produce reference/motion.md (30 fps).
"""
import math, os, sys
from mark import leg, P, LEG_W, ARC_W, SAG, INK, PAPER, ACCENT, f, text_path, asc_height, font
from system import DISPLAY, LABEL

K = 9.0                     # px per mark unit
W, H, FPS = 1920, 1080, 30
SNAP = {"type": "cubic-bezier", "x1": 0.20, "y1": 0.90, "x2": 0.05, "y2": 0.95}
FIRM = {"type": "cubic-bezier", "x1": 0.15, "y1": 0.25, "x2": 0.15, "y2": 0.95}
SOFT = {"type": "cubic-bezier", "x1": 0.20, "y1": 0.05, "x2": 0.40, "y2": 1.00}
S_CURVE = {"type": "cubic-bezier", "x1": 0.70, "y1": 0.15, "x2": 0.45, "y2": 0.95}

# lockup frame in mark units, the same as marks/horizontal.svg
VX, VY, VH = 14.0, -3.0, 62.0


def part_svg(body, vw, vh, vx=VX, vy=VY):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{vw * K * 2:.0f}" height="{vh * K * 2:.0f}" '
            f'viewBox="{vx} {vy} {vw:.2f} {vh}">{body}</svg>')


def build(out):
    os.makedirs(os.path.join(out, "parts"), exist_ok=True)
    name, axes, track = DISPLAY
    size = 100 * (54.4 * 0.70) / asc_height(name, axes, 100)
    _, ww = text_path("telier", name, axes, size, 47.5, 53, track * size / 10, INK)
    VW = 47.5 + ww - 8 - VX + 2

    def write(n, svg):
        p = os.path.join(out, "parts", n)
        open(p, "w").write(svg)
        return f"parts/{n}"  # relative to the .atelier file

    lp, lh = leg(-1)
    rp, rh = leg(1)
    body = (f'<path fill="{INK}" d="{lp}"/>'
            f'<path fill="none" stroke="{INK}" stroke-width="3" stroke-linecap="round" d="M32 2.5v5"/>'
            f'<circle cx="32" cy="{f(P[1])}" r="4" fill="{INK}"/>')
    assets = {"body": write("body.svg", part_svg(body, VW, VH)),
              "pencil": write("pencil-leg.svg", part_svg(f'<path fill="{INK}" d="{rp}"/>', VW, VH))}

    # letters, each placed where the word sets it
    ft = font(name, axes)
    gs, cmap = ft.getGlyphSet(), ft.getBestCmap()
    s = size / ft["head"].unitsPerEm
    from mark import kern_pairs
    kp = kern_pairs(ft)
    x = 47.5
    letters = []
    word = "telier"
    for i, ch in enumerate(word):
        g = cmap[ord(ch)]
        path, _ = text_path(ch, name, axes, size, x, 53, 0, INK)
        aid = f"l{i}"
        assets[aid] = write(f"letter-{i}-{ch}.svg", part_svg(path, VW, VH))
        letters.append(aid)
        x += gs[g].width * s + track * size / 10
        if i + 1 < len(word):
            x += kp.get((g, cmap[ord(word[i + 1])]), 0) * s

    # tagline, centred under the lockup
    lname, laxes, ltrack = LABEL
    lsize = 5.2
    _, lw = text_path("DESIGN & CONTENT STUDIO", lname, laxes, lsize, 0, 0, ltrack * lsize / 10, INK)
    tx = VX + (VW - lw) / 2
    tag, _ = text_path("DESIGN & CONTENT STUDIO", lname, laxes, lsize, tx, 72, ltrack * lsize / 10, INK)
    assets["tag"] = write("tagline.svg", part_svg(tag, VW, 80))

    # canvas placement: lockup + tagline block centred
    bw, bh = VW * K, 80 * K
    ox, oy = (W - bw) / 2, (H - bh) / 2 + 20
    to_px = lambda mx, my: ((mx - VX) * K, (my - VY) * K)
    hinge = to_px(*P)

    # the arc as a native path so it can draw on (stroke end 0 → 1)
    a, b = to_px(*lh), to_px(*rh)
    half = (rh[0] - lh[0]) / 2
    r = (half * half + SAG * SAG) / (2 * SAG)
    theta = 2 * math.asin(half / r)
    hlen = 4 / 3 * math.tan(theta / 4) * r * K
    # tangent at the left end points down-right, at the right end up-right (sagging arc)
    ang = theta / 2
    out_h = {"x": round(hlen * math.cos(ang), 2), "y": round(hlen * math.sin(ang), 2)}
    in_h = {"x": round(-hlen * math.cos(ang), 2), "y": round(hlen * math.sin(ang), 2)}

    layers, deltas = [], []
    full = {"frame": {"x": 0, "y": 0}, "bounds": {"width": round(bw, 2), "height": round(VH * K, 2)}}

    def img(lid, aid, extra=None, h=VH):
        L = {"id": lid, "parentId": "lockup", "visual": {"type": "image", "assetId": aid},
             "frame": {"x": 0, "y": 0}, "bounds": {"width": round(bw, 2), "height": round(h * K, 2)}}
        L.update(extra or {})
        layers.append(L)

    layers.append({"id": "lockup", "visual": {"type": "group"}, "frame": {"x": round(ox, 2), "y": round(oy, 2)},
                   "bounds": {"width": round(bw, 2), "height": round(bh, 2)},
                   "anchorPoint": {"x": round(hinge[0] / bw, 4), "y": round(28 * K / bh, 4)}})
    layers.append({"id": "arc", "parentId": "lockup",
                   "visual": {"type": "shape", "shape": {"type": "path", "closed": False, "points": [
                       {"x": round(a[0], 2), "y": round(a[1], 2), "out": out_h},
                       {"x": round(b[0], 2), "y": round(b[1], 2), "in": in_h}]},
                              "stroke": {"color": ACCENT, "width": ARC_W * K}},
                   **full})
    img("body", "body")
    img("pencil", "pencil", {"anchorPoint": {"x": round(hinge[0] / bw, 4), "y": round(hinge[1] / (VH * K), 4)}})
    for aid in letters:
        img(aid, aid)
    img("tag", "tag", h=80)

    D = lambda layer, prop, rng, fr, to, ease: deltas.append(
        {"layer": layer, "property": prop, "range": list(rng), "from": fr, "to": to, "easing": ease})
    # 0-18: the compass lands from larger than life, legs closed, already moving
    # firm decel, not snap: snap is 95% done at half time and leaves the tail frozen
    D("lockup", "scale.x", (0, 20), 1.5, 1.04, FIRM)
    D("lockup", "scale.y", (0, 20), 1.5, 1.04, FIRM)
    D("body", "opacity", (0, 5), 0, 1, "linear")
    D("pencil", "opacity", (0, 5), 0, 1, "linear")
    # 12-36: the pencil leg swings open while the arc draws the crossbar
    D("pencil", "rotation", (0, 8), 31, 31, "linear")
    D("pencil", "rotation", (8, 34), 31, 0, S_CURVE)
    D("arc", "visual.stroke.end", (0, 10), 0, 0, "linear")
    D("arc", "visual.stroke.end", (10, 34), 0, 1, S_CURVE)
    # 30-52: the compass, landed at centre, glides to its place as the word arrives
    cx_off = round(W / 2 - (ox + hinge[0]), 2)
    D("lockup", "frame.x", (0, 28), round(ox + cx_off, 2), round(ox + cx_off, 2), "linear")
    D("lockup", "frame.x", (28, 52), round(ox + cx_off, 2), round(ox, 2), S_CURVE)
    # 36-62: telier rises in, uneven gaps, tails overlapping
    t0, gaps = 34, [0, 2, 5, 7, 10, 12]
    for aid, g in zip(letters, gaps):
        st = t0 + g
        D(aid, "opacity", (0, st), 0, 0, "linear")
        D(aid, "opacity", (st, st + 6), 0, 1, "linear")
        D(aid, "frame.y", (0, st), 26, 26, "linear")
        D(aid, "frame.y", (st, st + 12), 26, 0, FIRM)
    # 58-74: the tagline settles
    D("tag", "opacity", (0, 52), 0, 0, "linear")
    D("tag", "opacity", (52, 60), 0, 1, "linear")
    D("tag", "frame.y", (0, 52), 18, 18, "linear")
    D("tag", "frame.y", (52, 70), 18, 0, FIRM)
        # 20-114: one slow drift under everything after the landing, so no frame is dead
    D("lockup", "scale.x", (20, 114), 1.04, 0.965, "linear")
    D("lockup", "scale.y", (20, 114), 1.04, 0.965, "linear")

    doc = {"version": "1.0", "name": "Atelier reveal",
           "description": "The compass lands, draws its crossbar, and becomes the A of Atelier.",
           "canvas": {"width": W, "height": H, "fps": FPS, "background": PAPER},
           "assets": {k: {"type": "svg", "src": v} for k, v in assets.items()},
           "layers": layers,
           "states": {"reveal": {"duration": 114, "deltas": deltas}}}
    import json
    # YAML is a superset of JSON; the .atelier loader reads it as YAML
    open(os.path.join(out, "reveal.atelier"), "w").write(json.dumps(doc, indent=1))
    print("ok", round(bw), round(bh))


if __name__ == "__main__":
    build(sys.argv[1])
