"""Generate the rune outline polygon for the skriv icon.

Centerline chain: E (top-right terminal) -> A (peak) -> B (left bend)
-> C (right bend) -> D (bottom chisel tip).
Terminal at E gets a horizontal cut. The tip: the outer (left) edge runs
straight to a point at full offset from D, while the inner edge curves in
over the last TAPER_LEN px to meet it, like a chisel exit stroke.
Interior vertices get miter joins (clamped to a bevel where configured).
"""

import math
import sys

# Centerline vertices, 1024-space
E = (627, 328)
A = (561, 262)
B = (397, 454)
C = (603, 644)
D = (429, 810)
TAPER_LEN = 110  # tip taper, along the centerline
TAPER_EASE = 0.30  # control point position within the taper, 0..1 from D
MITER_CLAMP = {1: 1.10}  # vertex index in chain -> max miter length, in half-widths


def sub(p, q):
    return (p[0] - q[0], p[1] - q[1])


def add(p, q):
    return (p[0] + q[0], p[1] + q[1])


def mul(p, s):
    return (p[0] * s, p[1] * s)


def norm(p):
    l = math.hypot(*p)
    return (p[0] / l, p[1] / l)


def perp(p):
    return (-p[1], p[0])


def line_isect(p1, d1, p2, d2):
    # p1 + t*d1 == p2 + s*d2
    den = d1[0] * d2[1] - d1[1] * d2[0]
    if abs(den) < 1e-9:
        return None
    t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
    return add(p1, mul(d1, t))


def outline(width):
    h = width / 2.0
    pts = [E, A, B, C, D]

    dirs = [norm(sub(pts[i + 1], pts[i])) for i in range(len(pts) - 1)]
    normals = [perp(u) for u in dirs]

    def side_points(sign):
        side = []
        # start: horizontal cut through E
        off0 = add(E, mul(normals[0], sign * h))
        cut = line_isect(off0, dirs[0], E, (1, 0))
        side.append(cut if cut else off0)
        # interior miters (clamped to a bevel where configured)
        for i in range(1, len(pts) - 1):
            p_prev = add(pts[i - 1], mul(normals[i - 1], sign * h))
            p_next = add(pts[i], mul(normals[i], sign * h))
            m = line_isect(p_prev, dirs[i - 1], p_next, dirs[i])
            if m is None:
                side.append(p_next)
                continue
            limit = MITER_CLAMP.get(i)
            v = sub(m, pts[i])
            dist = math.hypot(*v)
            if limit is not None and dist > limit * h:
                bis = norm(v)
                clamp_pt = add(pts[i], mul(bis, limit * h))
                cut_dir = perp(bis)
                b1 = line_isect(p_prev, dirs[i - 1], clamp_pt, cut_dir)
                b2 = line_isect(p_next, dirs[i], clamp_pt, cut_dir)
                side.extend([p for p in (b1, b2) if p])
            else:
                side.append(m)
        return side

    left = side_points(1.0)
    right = side_points(-1.0)
    # tip: the left edge runs to its full offset at D (the point of the
    # chisel); the right edge stops short at the taper start and curves
    # across to meet it
    u_last = dirs[-1]
    n_last = perp(u_last)
    left.append(add(D, mul(n_last, h)))
    dm = add(D, mul(u_last, -TAPER_LEN))
    right.append(add(dm, mul(n_last, -h)))
    ctrl_at = add(D, mul(u_last, -TAPER_LEN * TAPER_EASE))
    ctrl = add(ctrl_at, mul(n_last, -h))
    return left, right, ctrl


def path_d(shape):
    left, right, ctrl = shape
    parts = [f"M {left[0][0]:.1f} {left[0][1]:.1f}"]
    parts += [f"L {p[0]:.1f} {p[1]:.1f}" for p in left[1:]]
    parts.append(f"Q {ctrl[0]:.1f} {ctrl[1]:.1f} {right[-1][0]:.1f} {right[-1][1]:.1f}")
    parts += [f"L {p[0]:.1f} {p[1]:.1f}" for p in right[:-1][::-1]]
    return " ".join(parts) + " Z"


if __name__ == "__main__":
    for w in [float(a) for a in sys.argv[1:]] or [88.0]:
        shape = outline(w)
        pts_all = shape[0] + shape[1]
        xs = [p[0] for p in pts_all]
        ys = [p[1] for p in pts_all]
        print(f"<!-- w={w}: bbox x {min(xs):.0f}..{max(xs):.0f}, y {min(ys):.0f}..{max(ys):.0f} -->")
        print(path_d(shape))
