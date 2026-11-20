// Zepp app icon: 240 x 240, circular artwork, transparent outside the circle.
//   node scripts/make-icon.cjs
// Writes assets/default.r/icon.png and assets/default.s/icon.png (identical), and
// docs/icon-preview.png (the icon on a light and a dark background, for checking).
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const S = Number(process.env.ICON_SIZE || 240)
const ROOT = path.join(__dirname, '..')
const OUT_DIRS = (process.env.ICON_DIRS || 'assets/default.r,assets/default.s').split(',')

function crc32(buf) {
  let c
  const t = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0 // filter: none
    px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// --- canvas ---------------------------------------------------------------
const buf = Buffer.alloc(S * S * 4, 0) // transparent by default
const cx = S / 2
const cy = S / 2
const R = S / 2 // the circle fills the square, edges included

// 4x4 supersampling gives clean edges without any drawing library.
const N = 4

function put(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= S || y >= S) return
  const i = (y * S + x) * 4
  // source-over, with the destination already composited
  const sa = a / 255
  const da = buf[i + 3] / 255
  const oa = sa + da * (1 - sa)
  if (oa === 0) return
  buf[i] = Math.round((r * sa + buf[i] * da * (1 - sa)) / oa)
  buf[i + 1] = Math.round((g * sa + buf[i + 1] * da * (1 - sa)) / oa)
  buf[i + 2] = Math.round((b * sa + buf[i + 2] * da * (1 - sa)) / oa)
  buf[i + 3] = Math.round(oa * 255)
}

// Paint a pixel by sampling N x N points; `shade(x, y)` returns [r,g,b,a] or null.
function paint(shade) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0, hits = 0
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const px = x + (sx + 0.5) / N
          const py = y + (sy + 0.5) / N
          const c = shade(px, py)
          if (!c) continue
          hits++
          // premultiplied accumulation so edge pixels keep their colour
          r += c[0] * c[3]
          g += c[1] * c[3]
          b += c[2] * c[3]
          a += c[3]
        }
      }
      if (!hits) continue
      const cov = a / N / N // 0..1 coverage of the pixel
      if (cov <= 0) continue
      put(x, y, Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(cov * 255))
    }
  }
}

// 1. the circle: a vertical gradient, clipped to the disc
paint((x, y) => {
  if (Math.hypot(x - cx, y - cy) > R) return null
  const t = (y - (cy - R)) / (2 * R) // 0 at top, 1 at bottom
  return [Math.round(18 + 34 * t), Math.round(84 + 62 * t), Math.round(126 + 68 * t), 1]
})

// 2. a sun in the upper right, clipped to the disc
paint((x, y) => {
  if (Math.hypot(x - cx, y - cy) > R) return null
  const d = Math.hypot(x - (cx + R * 0.36), y - (cy - R * 0.34))
  return d < R * 0.22 ? [255, 198, 74, 1] : null
})

// 3. a cloud across the middle, clipped to the disc
const cloudY = cy + R * 0.06
const cloudScale = R / 96
paint((x, y) => {
  if (Math.hypot(x - cx, y - cy) > R) return null
  const inDisc =
    Math.hypot(x - (cx - 26 * cloudScale), y - cloudY) < 21 * cloudScale ||
    Math.hypot(x - cx, y - (cloudY - 13 * cloudScale)) < 29 * cloudScale ||
    Math.hypot(x - (cx + 25 * cloudScale), y - cloudY) < 18 * cloudScale ||
    (x > cx - 30 * cloudScale && x < cx + 29 * cloudScale &&
      y > cloudY && y < cloudY + 13 * cloudScale)
  return inDisc ? [240, 246, 252, 1] : null
})

// 4. three rain drops below the cloud
paint((x, y) => {
  if (Math.hypot(x - cx, y - cy) > R) return null
  const top = cloudY + R * 0.2
  for (const dx of [-0.2, 0, 0.2]) {
    const dropX = cx + dx * R
    const len = R * 0.17
    // a rounded stroke: distance to the vertical segment
    const dy = y - top
    if (dy < 0 || dy > len) continue
    if (Math.abs(x - dropX) <= R * 0.023) return [126, 224, 232, 1]
  }
  return null
})

const iconPng = png(S, S, buf)

for (const dir of OUT_DIRS) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true })
  const file = process.env.ICON_NAME || 'icon.png'
  fs.writeFileSync(path.join(ROOT, dir, file), iconPng)
}
console.log('wrote ' + S + 'x' + S + ' icon to ' + OUT_DIRS.join(', '))

// --- preview sheet: the icon on light and dark, to eyeball the transparency ---
const PAD = 24
const W = S * 2 + PAD * 3
const H = S + PAD * 2
const sheet = Buffer.alloc(W * H * 4)
// left half light grey, right half dark, so the transparent corner is obvious
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const light = x < W / 2
    sheet[i] = light ? 232 : 26
    sheet[i + 1] = light ? 236 : 32
    sheet[i + 2] = light ? 242 : 40
    sheet[i + 3] = 255
  }
}
function blend(x0, y0) {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const s = (y * S + x) * 4
      const a = iconPng.length && buf[s + 3] / 255
      if (a <= 0) continue
      const d = ((y + y0) * W + (x + x0)) * 4
      sheet[d] = Math.round(buf[s] * a + sheet[d] * (1 - a))
      sheet[d + 1] = Math.round(buf[s + 1] * a + sheet[d + 1] * (1 - a))
      sheet[d + 2] = Math.round(buf[s + 2] * a + sheet[d + 2] * (1 - a))
      sheet[d + 3] = 255
    }
  }
}
blend(PAD, PAD)
blend(S + PAD * 2, PAD)
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'docs/icon-preview.png'), png(W, H, sheet))
console.log('wrote docs/icon-preview.png')
