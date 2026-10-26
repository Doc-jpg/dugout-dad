# App icon: a baseball diamond, big and simple so it reads at 60 px. Drawn at 4x and downsampled.
from PIL import Image, ImageDraw
import sys, os, math
out = sys.argv[1]

GRASS = (52, 140, 84)
GRASS_FAN = (64, 158, 96)
DIRT = (214, 150, 86)
LINE = (255, 255, 255)

def field(size, pad_ratio, rounded):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.225, fill=GRASS)
    else:
        d.rectangle([0, 0, S - 1, S - 1], fill=GRASS)
    pad = pad_ratio
    # Home plate near the bottom, second base near the top: the diamond fills the square.
    hx, hy = S / 2, S * (0.90 - pad)
    L = S * (0.37 - pad * 0.9)          # basepath length
    first = (hx + L * 0.707, hy - L * 0.707)
    second = (hx, hy - L * 1.414)
    third = (hx - L * 0.707, hy - L * 0.707)
    mx, my = hx, hy - L * 0.67          # mound
    # Outfield: lighter grass fan between the foul lines
    R = S * 1.5
    d.pieslice([hx - R, hy - R, hx + R, hy + R], 225, 315, fill=GRASS_FAN)
    # Infield dirt: arc around the mound plus the diamond
    r_arc = L * 1.08
    d.pieslice([mx - r_arc, my - r_arc, mx + r_arc, my + r_arc], 200, 340, fill=DIRT)
    d.polygon([(hx, hy), first, second, third], fill=DIRT)
    # Grass inside the diamond
    inset = L * 0.16
    d.polygon([(hx, hy - inset * 1.4), (first[0] - inset, first[1]), (second[0], second[1] + inset * 1.4), (third[0] + inset, third[1])], fill=GRASS)
    # Dirt circle at home and the mound
    rh = L * 0.24
    d.ellipse([hx - rh, hy - rh * 0.75, hx + rh, hy + rh * 0.75], fill=DIRT)
    rm = L * 0.15
    d.ellipse([mx - rm, my - rm, mx + rm, my + rm], fill=DIRT)
    # Base paths and foul lines in white, thick enough to survive downsampling
    w = max(3, int(S * 0.02))
    for ang in (225, 315):
        ex = hx + R * math.cos(math.radians(ang)); ey = hy + R * math.sin(math.radians(ang))
        d.line([(hx, hy), (ex, ey)], fill=LINE, width=w)
    d.line([first, second, third], fill=LINE, width=w)
    d.rectangle([mx - rm * 0.5, my - rm * 0.12, mx + rm * 0.5, my + rm * 0.12], fill=LINE)
    # Bases
    b = L * 0.11
    for (x, y) in (first, second, third):
        d.polygon([(x, y - b), (x + b, y), (x, y + b), (x - b, y)], fill=LINE)
    hb = L * 0.11
    d.polygon([(hx - hb, hy - hb), (hx + hb, hy - hb), (hx + hb, hy), (hx, hy + hb), (hx - hb, hy)], fill=LINE)
    return img.resize((size, size), Image.LANCZOS)

for name, size, pad, rounded in [('icon-192.png', 192, 0.03, True), ('icon-512.png', 512, 0.03, True), ('icon-512-maskable.png', 512, 0.12, False), ('apple-touch-icon.png', 180, 0.04, False), ('favicon.png', 64, 0.03, True)]:
    field(size, pad, rounded).save(os.path.join(out, name))
print('ok')
