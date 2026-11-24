// Resolution-independent layout for every Zepp OS watch the app targets.
//
// Each screen shape has one reference design, matching Zepp's own UI design
// benchmarks (docs.zepp.com › Screen adaptation): 480 x 480 for round screens
// and 390 x 450 for square screens. computeLayout() scales that reference to
// the real screen size from getDeviceInfo(), so the same code covers round
// 360, 416, 454, 466 and 480 screens and square 320 x 380 and 390 x 450 ones.
// It does not use px(), which scales by app.json's designWidth only and so
// cannot follow a square screen's height.
//
// This file must stay free of imports: the Node tests load it directly.

// Reference designs, in reference pixels. Rows that span the screen give a
// side margin `m` instead of x/w, so they always stay centred.
const REF = {
  round: {
    width: 480,
    height: 480,
    title: { m: 100, y: 38, h: 34, font: 22 },
    cond: { m: 70, y: 70, h: 30, font: 22 },
    temp: { m: 30, y: 96, h: 120, font: 92 },
    feels: { m: 40, y: 214, h: 30, font: 24 },
    big: { m: 30, y: 110, h: 80, font: 62 },
    mid: { m: 40, y: 186, h: 34, font: 28 },
    small: { m: 40, y: 222, h: 30, font: 24 },
    status: { m: 50, y: 96, h: 130, font: 26 },
    retry: { w: 324, y: 240, h: 78, font: 28 },
    buttons: { w: 110, gap: 16, y: 296, h: 58, font: 26 },
    dots: { gap: 18, size: 6, below: 26 },
    supTitle: { m: 40, y: 66, h: 40, font: 26 },
    supBody: { m: 50, y: 104, h: 150, font: 22 }
  },
  square: {
    width: 390,
    height: 450,
    title: { m: 20, y: 20, h: 34, font: 22 },
    cond: { m: 20, y: 54, h: 30, font: 22 },
    temp: { m: 16, y: 96, h: 120, font: 92 },
    feels: { m: 16, y: 220, h: 30, font: 24 },
    big: { m: 16, y: 110, h: 80, font: 62 },
    mid: { m: 16, y: 196, h: 34, font: 28 },
    small: { m: 16, y: 234, h: 30, font: 24 },
    status: { m: 20, y: 96, h: 150, font: 26 },
    retry: { w: 324, y: 256, h: 72, font: 28 },
    buttons: { w: 110, gap: 12, y: 330, h: 58, font: 26 },
    dots: { gap: 18, size: 6, below: 22 },
    supTitle: { m: 20, y: 40, h: 40, font: 26 },
    supBody: { m: 24, y: 90, h: 200, font: 22 }
  }
}

const TEXT_ROWS = ['title', 'cond', 'temp', 'feels', 'big', 'mid', 'small', 'status', 'supTitle', 'supBody']

/**
 * @param {number} width   real screen width from getDeviceInfo()
 * @param {number} height  real screen height from getDeviceInfo()
 * @param {boolean} round  true for round screens
 * @returns layout in real screen pixels
 */
export function computeLayout(width, height, round) {
  const ref = round ? REF.round : REF.square
  const sx = width / ref.width
  const sy = height / ref.height
  const sf = Math.min(sx, sy) // fonts and radii: never grow past either axis
  const X = (v) => Math.round(v * sx)
  const Y = (v) => Math.round(v * sy)
  const F = (v) => Math.max(1, Math.round(v * sf))

  const out = { width: width, height: height, round: !!round }

  TEXT_ROWS.forEach((name) => {
    const r = ref[name]
    const m = X(r.m)
    out[name] = { x: m, y: Y(r.y), w: width - 2 * m, h: Y(r.h), font: F(r.font) }
  })

  const rw = X(ref.retry.w)
  const rh = Y(ref.retry.h)
  out.retry = {
    x: Math.round((width - rw) / 2),
    y: Y(ref.retry.y),
    w: rw,
    h: rh,
    radius: Math.floor(Math.min(rw, rh) / 2),
    font: F(ref.retry.font)
  }

  // Three buttons (<, refresh, >), centred as a row so they never overlap.
  const bw = X(ref.buttons.w)
  const bh = Y(ref.buttons.h)
  const gap = X(ref.buttons.gap)
  const startX = Math.round((width - (3 * bw + 2 * gap)) / 2)
  const by = Y(ref.buttons.y)
  const btn = (i) => ({ x: startX + i * (bw + gap), y: by, w: bw, h: bh, radius: Math.floor(Math.min(bw, bh) / 2) })
  out.buttons = { prev: btn(0), refresh: btn(1), next: btn(2), font: F(ref.buttons.font) }

  const size = Math.max(4, F(ref.dots.size))
  out.dots = {
    y: by + bh + Y(ref.dots.below),
    gap: Math.max(size + 4, X(ref.dots.gap)),
    size: size
  }

  return out
}

// x of dot i (left edge) when `count` dots are centred on the screen.
export function dotX(layout, i, count) {
  const first = Math.round((layout.width - (count - 1) * layout.dots.gap) / 2)
  return first + i * layout.dots.gap - Math.floor(layout.dots.size / 2)
}

export const RETRY_TEXT = 'Try again'
