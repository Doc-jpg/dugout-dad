# App icon: a baseball field seen from above, home plate at the bottom, drawn at 4x and downsampled.
from PIL import Image, ImageDraw
import sys, os, math
out = sys.argv[1]

GRASS = (46, 125, 78)
GRASS_DARK = (37, 104, 64)
DIRT = (196, 128, 66)
LINE = (255, 255, 255)
BG = (20, 56, 36)

def field(size, pad_ratio, rounded):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.225, fill=BG)
    else:
        d.rectangle([0, 0, S - 1, S - 1], fill=BG)
    pad = S * pad_ratio
    # Home plate position and scale
    hx, hy = S / 2, S - pad - S * 0.08
    L = S * (0.34 - pad_ratio * 0.8)  # basepath length
    # Outfield grass: fan between the foul lines (45 degrees each side of straight up), radius ~ 2.1 L
    R = L * 2.75
    d.pieslice([hx - R, hy - R, hx + R, hy + R], 225, 315, fill=GRASS)
    # Mowing stripes for a bit of life
    for i, r in enumerate([R * 0.82, R * 0.64]):
        d.pieslice([hx - r, hy - r, hx + r, hy + r], 225, 315, fill=GRASS_DARK if i == 0 else GRASS)
    # Infield dirt: arc radius ~1.45 L centred at the mound, plus the diamond
    mx, my = hx, hy - L * 0.72
    r_arc = L * 1.12
    d.pieslice([mx - r_arc, my - r_arc, mx + r_arc, my + r_arc], 205, 335, fill=DIRT)
    # Dirt diamond (the basepaths) under the grass infield
    first = (hx + L * 0.707, hy - L * 0.707)
    second = (hx, hy - L * 1.414)
    third = (hx - L * 0.707, hy - L * 0.707)
    d.polygon([(hx, hy), first, second, third], fill=DIRT)
    # Grass inside the diamond
    inset = L * 0.17
    d.polygon([(hx, hy - inset * 1.3), (first[0] - inset, first[1]), (second[0], second[1] + inset * 1.2), (third[0] + inset, third[1])], fill=GRASS)
    # Dirt circle around home
    rh = L * 0.26
    d.ellipse([hx - rh, hy - rh * 0.7, hx + rh, hy + rh * 0.7], fill=DIRT)
    # Mound
    rm = L * 0.14
    d.ellipse([mx - rm, my - rm, mx + rm, my + rm], fill=DIRT)
    d.rectangle([mx - rm * 0.45, my - rm * 0.1, mx + rm * 0.45, my + rm * 0.1], fill=LINE)
    # Foul lines
    w = max(2, int(S * 0.012))
    for ang in (225, 315):
        ex = hx + R * math.cos(math.radians(ang))
        ey = hy + R * math.sin(math.radians(ang))
        d.line([(hx, hy), (ex, ey)], fill=LINE, width=w)
    # Bases
    b = L * 0.12
    for (x, y) in (first, second, third):
        d.polygon([(x, y - b), (x + b, y), (x, y + b), (x - b, y)], fill=LINE)
    # Home plate
    hb = L * 0.11
    d.polygon([(hx - hb, hy - hb * 0.9), (hx + hb, hy - hb * 0.9), (hx + hb, hy), (hx, hy + hb), (hx - hb, hy)], fill=LINE)
    return img.resize((size, size), Image.LANCZOS)

for name, size, pad, rounded in [('icon-192.png', 192, 0.06, True), ('icon-512.png', 512, 0.06, True), ('icon-512-maskable.png', 512, 0.14, False), ('apple-touch-icon.png', 180, 0.07, False), ('favicon.png', 64, 0.06, True)]:
    field(size, pad, rounded).save(os.path.join(out, name))
print('ok')
