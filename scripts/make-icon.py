#!/usr/bin/env python3
"""Build the Zepp app icons from assets-src/icon-source.png.

    python3 scripts/make-icon.py      (needs Pillow: pip install pillow)

The source is square artwork (sun and cloud on Tempest purple). This script:
  1. snaps the background to exactly Tempest purple #512B59,
  2. clips the artwork to a circle; everything outside it is fully transparent,
     with an anti-aliased edge,
  3. writes the same icon at both sizes into BOTH asset folders, so every
     device package in the .zab carries identical icons:
        assets/default.r/icon.png      240 x 240
        assets/default.r/icon-256.png  256 x 256  (app.json "icon")
        assets/default.s/icon.png      240 x 240
        assets/default.s/icon-256.png  256 x 256
  4. writes docs/icon-preview.png (the icon on light and dark backgrounds).
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets-src' / 'icon-source.png'
PURPLE = (0x51, 0x2B, 0x59)
SIZES = {'icon.png': 240, 'icon-256.png': 256}
DIRS = ['assets/default.r', 'assets/default.s']
SUPERSAMPLE = 4  # mask drawn at 4x then reduced, for a smooth circle edge


def snap_background(img):
    """Recolour pixels close to the source's background purple to #512B59."""
    img = img.convert('RGB')
    bg = img.getpixel((4, 4))
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) <= 24:
                px[x, y] = PURPLE
    return img


def circular(img, size):
    art = img.resize((size, size), Image.LANCZOS).convert('RGBA')
    big = size * SUPERSAMPLE
    mask = Image.new('L', (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    art.putalpha(mask)
    # Fully transparent pixels carry no colour (keeps the PNG clean and small).
    clear = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    return Image.composite(art, clear, mask)


def preview(icon):
    s = icon.size[0]
    sheet = Image.new('RGBA', (s * 2 + 60, s + 40), (0, 0, 0, 0))
    sheet.paste((245, 247, 250, 255), (0, 0, s + 30, s + 40))
    sheet.paste((24, 32, 42, 255), (s + 30, 0, s * 2 + 60, s + 40))
    sheet.alpha_composite(icon, (15, 20))
    sheet.alpha_composite(icon, (s + 45, 20))
    return sheet


def main():
    art = snap_background(Image.open(SOURCE))
    icons = {name: circular(art, size) for name, size in SIZES.items()}
    for d in DIRS:
        (ROOT / d).mkdir(parents=True, exist_ok=True)
        for name, icon in icons.items():
            icon.save(ROOT / d / name, optimize=True)
            print('wrote', f'{d}/{name}', icon.size)
    preview(icons['icon.png']).save(ROOT / 'docs' / 'icon-preview.png', optimize=True)
    print('wrote docs/icon-preview.png')


if __name__ == '__main__':
    main()
