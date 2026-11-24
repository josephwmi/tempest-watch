#!/usr/bin/env python3
"""Render 360 x 360 store screenshots (round and square) of the main page.

Widget positions, sizes and font sizes come from page/metrics.js
(computeLayout), and colours from page/index.js, so the images follow the
real layout. Text is drawn with Roboto, not the watch's own font, and the
reading is sample data.

    python3 scripts/make-screenshots.py
"""
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'screenshots')
SIZE = 360
SS = 4  # supersampling for smooth edges

BG, TEXT, DIM, ACCENT, BTN = '#000000', '#ffffff', '#8a94a6', '#4dd0e1', '#1b2430'
FONT = '/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf'
SYMBOL_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

# Sample reading, formatted the way page/index.js paintView() formats it.
SAMPLE = {
    'title': 'Home Station',
    'cond': 'Daylight  \u00b7  2m ago',
    'temp': '68\u00b0F',
    'feels': 'Feels 67\u00b0F  \u00b7  Pleasant',
}

LAYOUT_JS = r"""
const fs = require('fs')
const src = fs.readFileSync(process.argv[1], 'utf8')
import('data:text/javascript,' + encodeURIComponent(src)).then((m) => {
  const out = {}
  for (const [k, round] of [['round', true], ['square', false]]) {
    const L = m.computeLayout(%d, %d, round)
    L.dotXs = [0, 1, 2, 3, 4].map((i) => m.dotX(L, i, 5))
    out[k] = L
  }
  console.log(JSON.stringify(out))
})
""" % (SIZE, SIZE)


def layouts():
    metrics = os.path.join(ROOT, 'page', 'metrics.js')
    res = subprocess.run(['node', '-e', LAYOUT_JS, metrics], capture_output=True, text=True, check=True)
    return json.loads(res.stdout)


def font(px, path=FONT):
    return ImageFont.truetype(path, px * SS)


def centred(draw, r, text, px, color, path=FONT):
    f = font(px, path)
    cx = (r['x'] + r['w'] / 2) * SS
    cy = (r['y'] + r['h'] / 2) * SS
    draw.text((cx, cy), text, font=f, fill=color, anchor='mm')


def render(L, round_):
    S = SIZE * SS
    img = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(img)

    centred(d, L['title'], SAMPLE['title'], L['title']['font'], DIM)
    centred(d, L['cond'], SAMPLE['cond'], L['cond']['font'], ACCENT)
    centred(d, L['temp'], SAMPLE['temp'], L['temp']['font'], TEXT)
    centred(d, L['feels'], SAMPLE['feels'], L['feels']['font'], DIM)

    B = L['buttons']
    for key, label, path in (('prev', '<', FONT), ('refresh', '\u21bb', SYMBOL_FONT), ('next', '>', FONT)):
        b = B[key]
        d.rounded_rectangle(
            [b['x'] * SS, b['y'] * SS, (b['x'] + b['w']) * SS, (b['y'] + b['h']) * SS],
            radius=b['radius'] * SS, fill=BTN)
        centred(d, b, label, B['font'], TEXT, path)

    size = L['dots']['size']
    for i, x in enumerate(L['dotXs']):
        y = L['dots']['y']
        d.ellipse([x * SS, y * SS, (x + size) * SS, (y + size) * SS], fill=ACCENT if i == 0 else BTN)

    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    if round_:
        # Round screens: keep only the visible circle, transparent outside.
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, S - 1, S - 1], fill=255)
        img = img.convert('RGBA')
        img.putalpha(mask.resize((SIZE, SIZE), Image.LANCZOS))
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    ls = layouts()
    for name, round_ in (('round', True), ('square', False)):
        path = os.path.join(OUT, 'screenshot-%s-360.png' % name)
        render(ls[name], round_).save(path, optimize=True)
        print('wrote', os.path.relpath(path, ROOT))


if __name__ == '__main__':
    main()
