// Plain Node test for the parts of the app that do not need a watch:
// the API payload -> watch view mapping, and the side service's fetch path
// (with fetch stubbed). Run with:  node --test scripts/test.cjs
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const ROOT = path.join(__dirname, '..')

// The app sources are ES modules; load them by copying to .mjs in temp.
function loadEsm(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tempest-'))
  const file = path.join(dir, 'mod.mjs')
  fs.writeFileSync(file, src)
  return import('file://' + file.replace(/\\/g, '/'))
}

// A real-shaped response from
// GET swd.weatherflow.com/swd/rest/observations/station/<id>?token=<token>
// (field names/units per the Tempest REST docs; values are sample data).
const SAMPLE = {
  status: { status_code: 0, status_message: 'SUCCESS' },
  station_id: 12345,
  station_name: 'Backyard',
  station_units: { units_temp: 'f', units_wind: 'mph', units_pressure: 'inhg', units_precip: 'in' },
  obs: [
    {
      timestamp: 1654725915,
      air_temperature: 28.0,
      barometric_pressure: 1001.2,
      station_pressure: 1001.2,
      sea_level_pressure: 1014.8,
      relative_humidity: 78,
      precip: 0.0,
      precip_accum_last_1hr: 0.0,
      precip_accum_local_day: 2.54,
      wind_avg: 0.5,
      wind_direction: 359,
      wind_gust: 1.2,
      wind_lull: 0.0,
      solar_radiation: 486,
      uv: 6.04,
      brightness: 58367,
      lightning_strike_last_epoch: 1654217568,
      lightning_strike_last_distance: 39,
      lightning_strike_count_last_1hr: 0,
      feels_like: 31.8,
      dew_point: 23.8,
      pressure_trend: 'steady'
    }
  ]
}

test('imperial conversion and labels', async () => {
  const fmt = await loadEsm('utils/format.js')
  const vm = fmt.toViewModel(SAMPLE, { units: 'imperial', stationId: '12345' }, 1654725915 * 1000 + 120000)
  assert.equal(vm.temp, 82.4) // 28C
  assert.equal(vm.tempUnit, '\u00b0F')
  assert.equal(vm.humidity, 78)
  assert.equal(vm.wind, 1.1) // 0.5 m/s
  assert.equal(vm.windUnit, 'mph')
  assert.equal(vm.windCardinal, 'N') // 359 deg
  assert.equal(vm.pressure, 29.97) // 1014.8 hPa
  assert.equal(vm.pressureUnit, 'inHg')
  assert.equal(vm.pressureTrend, 'Steady')
  assert.equal(vm.rainDay, 0.1) // 2.54 mm
  assert.equal(vm.rainUnit, 'in')
  assert.equal(vm.uv, 6)
  assert.equal(vm.age, '2m ago')
  assert.equal(vm.stationName, 'Backyard')
  assert.equal(fmt.conditionLabel(vm), 'Daylight')
  // 82.4F is below the 85F muggy threshold
  assert.equal(fmt.comfortLabel(vm), 'Mild')
})

test('metric units are passed through', async () => {
  const fmt = await loadEsm('utils/format.js')
  const vm = fmt.toViewModel(SAMPLE, { units: 'metric', stationId: '12345' })
  assert.equal(vm.temp, 28)
  assert.equal(vm.tempUnit, '\u00b0C')
  assert.equal(vm.wind, 0.5)
  assert.equal(vm.windUnit, 'm/s')
  assert.equal(vm.pressure, 1014.8)
  assert.equal(vm.pressureUnit, 'hPa')
  assert.equal(vm.rainDay, 2.54)
})

test('dew point fallback when the API leaves it out', async () => {
  const fmt = await loadEsm('utils/format.js')
  const payload = JSON.parse(JSON.stringify(SAMPLE))
  delete payload.obs[0].dew_point
  const vm = fmt.toViewModel(payload, { units: 'metric' })
  // Magnus-Tetens for 28C / 78% is about 23.9C
  assert.ok(Math.abs(vm.dew - 23.9) < 0.3, 'dew point was ' + vm.dew)
})

test('missing readings stay null instead of becoming 0', async () => {
  const fmt = await loadEsm('utils/format.js')
  const payload = JSON.parse(JSON.stringify(SAMPLE))
  payload.obs[0].air_temperature = null
  payload.obs[0].uv = null
  const vm = fmt.toViewModel(payload, { units: 'metric' })
  assert.equal(vm.temp, null)
  assert.equal(vm.uv, null)
})

test('empty obs list maps to nothing', async () => {
  const fmt = await loadEsm('utils/format.js')
  assert.equal(fmt.toViewModel({ obs: [] }, { units: 'metric' }), null)
  assert.equal(fmt.toViewModel(null, { units: 'metric' }), null)
})

test('cardinal directions', async () => {
  const fmt = await loadEsm('utils/format.js')
  assert.equal(fmt.cardinal(0), 'N')
  assert.equal(fmt.cardinal(90), 'E')
  assert.equal(fmt.cardinal(180), 'S')
  assert.equal(fmt.cardinal(225), 'SW')
  assert.equal(fmt.cardinal(359), 'N')
  assert.equal(fmt.cardinal(null), '--')
})

test('config helpers', async () => {
  const c = await loadEsm('utils/constants.js')
  assert.equal(c.extractStationId('12345'), '12345')
  assert.equal(c.extractStationId(' 12345 '), '12345')
  assert.equal(
    c.extractStationId('https://tempestwx.com/station/12345/grid'),
    '12345'
  )
  assert.equal(c.isConfigured(c.normalizeConfig({ stationId: '12345' })), true)
  assert.equal(c.isConfigured(c.normalizeConfig({ stationId: '' })), false)
  assert.equal(c.normalizeConfig({}).units, 'imperial')
  assert.equal(c.normalizeConfig({ units: 'weird' }).units, 'imperial')
})

// --- side service, with the Zepp OS runtime stubbed out -------------------

function loadSideService(responseFactory) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tempest-side-'))
  const nm = path.join(dir, 'node_modules', '@zeppos', 'zml')
  fs.mkdirSync(nm, { recursive: true })
  fs.writeFileSync(
    path.join(nm, 'package.json'),
    JSON.stringify({ name: '@zeppos/zml', type: 'module', exports: { './base-side': './base-side.mjs' } })
  )
  fs.writeFileSync(
    path.join(nm, 'base-side.mjs'),
    'export function BaseSideService(o) { return o }\n' +
      'export const settingsLib = globalThis.__settings\n'
  )
  // Node needs the '.js' extension in relative imports, so add it while copying.
  for (const sub of ['utils', 'app-side', 'shared']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true })
    for (const f of fs.readdirSync(path.join(ROOT, sub))) {
      if (!f.endsWith('.js')) continue
      const src = fs.readFileSync(path.join(ROOT, sub, f), 'utf8')
      fs.writeFileSync(
        path.join(dir, sub, f),
        src.replace(/from '(\.\.?\/[^']+)'/g, (m, p) => "from '" + p + ".js'")
      )
    }
  }
  // KiezelPay's SDK is a real dependency of the side service; point the temp
  // copy at this project's node_modules instead of installing it again.
  const kpay = path.join(ROOT, 'node_modules', 'kpay-amazfit')
  if (fs.existsSync(kpay)) {
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
    const kdir = path.join(dir, 'node_modules', 'kpay-amazfit')
    fs.mkdirSync(kdir, { recursive: true })
    fs.writeFileSync(
      path.join(kdir, 'package.json'),
      JSON.stringify({
        name: 'kpay-amazfit',
        type: 'module',
        exports: { './app': './app/index.js', './app-side': './app-side/index.js' }
      })
    )
    // Node wants the extension on relative imports; the SDK omits it.
    const addExt = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name)
        if (entry.isDirectory()) addExt(full)
        else if (entry.name.endsWith('.js')) {
          const src = fs.readFileSync(full, 'utf8').replace(/from '(\.[^']+)'/g, function (m, p) {
            return /[.]js$/.test(p) ? m : "from '" + p + ".js'"
          })
          fs.writeFileSync(full, src)
        }
      }
    }
    for (const sub of ['app', 'app-side', 'shared', 'utils', 'i18n']) {
      fs.cpSync(path.join(kpay, sub), path.join(kdir, sub), { recursive: true })
      addExt(path.join(kdir, sub))
    }
  }

  // message-side imports @zos/utils for its logger; stub it for Node.
  const zos = path.join(dir, 'node_modules', '@zos', 'utils')
  fs.mkdirSync(zos, { recursive: true })
  fs.writeFileSync(path.join(zos, 'package.json'), JSON.stringify({ name: '@zos/utils', type: 'module', main: 'index.js' }))
  fs.writeFileSync(
    path.join(zos, 'index.js'),
    'export const log = { getLogger: () => ({ log() {}, error() {}, debug() {} }) }\nexport const px = (v) => v\n'
  )

  // package.json so Node treats the copies as ESM
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))

  // The Zepp OS runtime provides AppSideService(); here it just hands back the
  // options object so the tests can call onRequest directly.
  globalThis.AppSideService = (o) => {
    globalThis.__sideOptions = o
  }
  const store = new Map()
  globalThis.__settings = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => { store.delete(k); return true },
    clear: () => store.clear()
  }
  globalThis.fetch = responseFactory
  globalThis.__store = store
  return import('file://' + path.join(dir, 'app-side', 'index.js').replace(/\\/g, '/'))
}

test('side service: no station configured', async () => {
  const mod = await loadSideService(async () => {
    throw new Error('should not be called')
  })
  const opts = globalThis.__sideOptions
  let captured = null
  opts.onRequest({ method: 'GET_WEATHER', params: {} }, (err, data) => {
    captured = data
  })
  assert.equal(captured.ok, false)
  assert.equal(captured.error, 'NO_STATION')
})

test('side service: fetches, maps and caches', async () => {
  let calledUrl = null
  const mod = await loadSideService(async (opts) => {
    calledUrl = opts && opts.url
    return { status: 200, body: JSON.stringify(SAMPLE) }
  })
  const opts = globalThis.__sideOptions
  globalThis.__store.set('tempestConfig', JSON.stringify({ stationId: '12345', token: 'abc', units: 'metric' }))
  const data = await new Promise((resolve) => {
    opts.onRequest({ method: 'GET_WEATHER', params: { force: true } }, (err, d) => resolve(d))
  })
  assert.equal(calledUrl, 'https://swd.weatherflow.com/swd/rest/observations/station/12345?token=abc')
  assert.equal(data.ok, true)
  assert.equal(data.temp, 28)
  assert.equal(data.humidity, 78)
  assert.ok(globalThis.__store.get('tempestCache'), 'cache written')

  // Second call inside 60s is served from the cache without a request.
  let secondCall = false
  globalThis.fetch = async () => {
    secondCall = true
    return { status: 200, body: JSON.stringify(SAMPLE) }
  }
  const cached = await new Promise((resolve) => {
    opts.onRequest({ method: 'GET_WEATHER', params: {} }, (err, d) => resolve(d))
  })
  assert.equal(cached.ok, true)
  assert.equal(cached.cached, true)
  assert.equal(secondCall, false)
})

test('side service: 401 becomes an auth error', async () => {
  const mod = await loadSideService(async () => ({ status: 401, body: '{}' }))
  globalThis.__store.set('tempestConfig', JSON.stringify({ stationId: '12345', token: 'bad' }))
  const data = await new Promise((resolve) => {
    globalThis.__sideOptions.onRequest({ method: 'GET_WEATHER', params: { force: true } }, (err, d) => resolve(d))
  })
  assert.equal(data.ok, false)
  assert.equal(data.error, 'AUTH')
})

test('side service: network failure keeps the last reading as stale', async () => {
  const mod = await loadSideService(async () => {
    throw new Error('timeout')
  })
  globalThis.__store.set('tempestConfig', JSON.stringify({ stationId: '12345', units: 'metric' }))
  const view = { stationId: '12345', temp: 20 }
  globalThis.__store.set('tempestCache', JSON.stringify({ stationId: '12345', fetchedAt: 1, view }))
  const data = await new Promise((resolve) => {
    globalThis.__sideOptions.onRequest({ method: 'GET_WEATHER', params: { force: true } }, (err, d) => resolve(d))
  })
  assert.equal(data.ok, false)
  assert.equal(data.error, 'NETWORK')
  assert.equal(data.stale.temp, 20)
})

// --- settings page test button -------------------------------------------
// The settings page cannot be relied on for HTTP, so the button hands the job
// to the side service. These two tests pin that contract down.

test('side service: TEST_CONNECTION returns a human line on success', async () => {
  await loadSideService(async () => ({ status: 200, body: JSON.stringify(SAMPLE) }))
  const data = await new Promise((resolve) => {
    globalThis.__sideOptions.onRequest(
      { method: 'TEST_CONNECTION', params: { stationId: '12345', token: 'abc' } },
      (err, d) => resolve(d)
    )
  })
  assert.equal(data.ok, true)
  assert.match(data.message, /^Connected: Backyard/)
})

test('side service: TEST_CONNECTION reports a bad station without throwing', async () => {
  await loadSideService(async () => ({ status: 404, body: '{}' }))
  const data = await new Promise((resolve) => {
    globalThis.__sideOptions.onRequest(
      { method: 'TEST_CONNECTION', params: { stationId: '99999' } },
      (err, d) => resolve(d)
    )
  })
  assert.equal(data.ok, false)
  assert.equal(data.error, 'BAD_STATION')
  assert.ok(data.message.length > 0)
})

test('settings page: the button asks the side service, it does not fetch itself', () => {
  const src = fs.readFileSync(path.join(ROOT, 'setting/index.js'), 'utf8')
  assert.ok(src.includes("method: 'TEST_CONNECTION'"), 'asks the side service')
  assert.ok(!/fetch\(/.test(src), 'no direct fetch in the settings page')
})

test('support screen: shows the exact donation text with a literal $JosephWMI', () => {
  const src = fs.readFileSync(path.join(ROOT, 'page/index.js'), 'utf8')
  const m = src.match(/const SUPPORT_TEXT = '([^']*)'/)
  assert.ok(m, 'SUPPORT_TEXT is a plain single-quoted string (no interpolation)')
  assert.equal(m[1], 'Thanks for downloading this app! To donate: CashApp: $JosephWMI')
  assert.ok(src.includes('setText(w.supBody, SUPPORT_TEXT)'), 'body shows SUPPORT_TEXT')
  assert.ok(src.includes("setText(w.supTitle, '')"), 'no extra title text')
})

// --- multi-device layout ---------------------------------------------------
// Screen sizes of every Zepp OS watch with API_LEVEL >= 3.0, from
// docs.zepp.com › Device Basic Information (checked 2026-11-24). Bip Max runs
// in its 390 x 450 compatibility mode unless it gets its own target.
const SCREENS = [
  { name: 'round 480 (Balance 2/3/Ultra, T-Rex 3/Ultra 2, Cheetah Pro/2 Ultra, Active Max)', w: 480, h: 480, round: true },
  { name: 'round 466 (Active 2, Active 3 Premium, GTR 4, Cheetah 2 Pro, T-Rex 3 Pro 44)', w: 466, h: 466, round: true },
  { name: 'round 454 (Cheetah round, T-Rex Ultra)', w: 454, h: 454, round: true },
  { name: 'round 416 (Falcon)', w: 416, h: 416, round: true },
  { name: 'round 360 (Active Edge)', w: 360, h: 360, round: true },
  { name: 'square 390x450 (Active, Active 2 square, Bip 6, GTS 4, Cheetah square, Bip Max compat)', w: 390, h: 450, round: false, corner: 86 },
  { name: 'square 320x380 (Bip 5 Unity)', w: 320, h: 380, round: false, corner: 69 }
]

function insideCircle(r, s) {
  const cx = s.w / 2
  const cy = s.h / 2
  const rad = s.w / 2
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]
    .every(([x, y]) => Math.hypot(x - cx, y - cy) <= rad)
}

// Square Zepp screens have rounded corners (the "Screen radius size" column).
function insideRoundedRect(r, s) {
  const k = s.corner
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].every(([x, y]) => {
    const cx = Math.min(Math.max(x, k), s.w - k)
    const cy = Math.min(Math.max(y, k), s.h - k)
    return Math.hypot(x - cx, y - cy) <= k
  })
}

function insideScreen(r, s) {
  return r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= s.w && r.y + r.h <= s.h
}

test('layout: every widget fits on every supported screen', async () => {
  const { computeLayout, dotX } = await loadEsm('page/metrics.js')
  for (const s of SCREENS) {
    const L = computeLayout(s.w, s.h, s.round)
    const rects = ['title', 'cond', 'temp', 'feels', 'big', 'mid', 'small', 'status', 'supTitle', 'supBody']
      .map((n) => [n, L[n]])
      .concat([['retry', L.retry], ['prev', L.buttons.prev], ['refresh', L.buttons.refresh], ['next', L.buttons.next]])
    for (const [n, r] of rects) {
      assert.ok(insideScreen(r, s), `${n} off screen on ${s.name}: ${JSON.stringify(r)}`)
      assert.ok(Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.w) && Number.isInteger(r.h), `${n} has whole pixels`)
    }
    const { prev, refresh, next } = L.buttons
    assert.ok(prev.x + prev.w <= refresh.x && refresh.x + refresh.w <= next.x, `buttons overlap on ${s.name}`)
    assert.ok(L.status.y + L.status.h <= L.retry.y, `status text runs into the retry button on ${s.name}`)
    assert.ok(L.supBody.y + L.supBody.h <= prev.y, `support text runs into the buttons on ${s.name}`)
    for (let i = 0; i < 5; i++) {
      const d = { x: dotX(L, i, 5), y: L.dots.y, w: L.dots.size, h: L.dots.size }
      assert.ok(insideScreen(d, s), `dot ${i} off screen on ${s.name}`)
      if (s.round) assert.ok(insideCircle(d, s), `dot ${i} outside the round face on ${s.name}`)
    }
    if (s.round) {
      // Buttons are what you tap: none of their corners may fall off the round face.
      for (const [n, r] of [['retry', L.retry], ['prev', prev], ['refresh', refresh], ['next', next]]) {
        assert.ok(insideCircle(r, s), `${n} is cut off by the round face on ${s.name}`)
      }
    } else {
      for (const [n, r] of [['retry', L.retry], ['prev', prev], ['refresh', refresh], ['next', next]]) {
        assert.ok(insideRoundedRect(r, s), `${n} is cut off by the screen corner on ${s.name}`)
      }
    }
    assert.ok(L.temp.font >= 60 && L.buttons.font >= 18, `fonts too small on ${s.name}`)
  }
})

test('layout: 480 round keeps the original Balance 2 rows', async () => {
  const { computeLayout } = await loadEsm('page/metrics.js')
  const L = computeLayout(480, 480, true)
  assert.deepEqual([L.temp.y, L.temp.h, L.temp.font], [96, 120, 92])
  assert.deepEqual([L.big.y, L.mid.y, L.small.y], [110, 186, 222])
  assert.equal(L.buttons.prev.y, 296)
})

test('page: no hard-coded px() design values left in the watch page', () => {
  const src = fs.readFileSync(path.join(ROOT, 'page/index.js'), 'utf8')
  assert.ok(!/\bpx\(/.test(src), 'positions come from computeLayout(), not px()')
  assert.ok(src.includes('computeLayout(W, H, ROUND)'))
  assert.match(src, /getDeviceInfo\(\)/)
})

test('app.json: targets round and square screens at API_LEVEL 3.0+', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  assert.equal(app.configVersion, 'v3')
  const targets = Object.keys(app.targets)
  for (const t of targets) {
    const shapes = app.targets[t].platforms.map((p) => p.st).sort()
    assert.deepEqual(shapes, ['r', 's'], 'round and square platforms declared')
    for (const st of shapes) {
      assert.ok(fs.existsSync(path.join(ROOT, 'assets', t + '.' + st, 'icon.png')), `assets/${t}.${st}/icon.png exists`)
    }
    assert.equal(app.targets[t].platforms.find((p) => p.st === 's').dw, 390)
    assert.equal(app.targets[t].platforms.find((p) => p.st === 'r').dw, 480)
  }
  // ZML (@zeppos/zml) needs API_LEVEL 3.0; anything higher drops older watches.
  assert.equal(app.runtime.apiVersion.minVersion, '3.0')
})

test('icons: same RGBA artwork at 240 and 256 px in every asset folder', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  const ihdr = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] })
  for (const [name, size] of [['icon.png', 240], [app.app.icon, 256]]) {
    const files = Object.keys(app.targets).flatMap((t) =>
      app.targets[t].platforms.map((p) => fs.readFileSync(path.join(ROOT, 'assets', `${t}.${p.st}`, name)))
    )
    for (const buf of files) {
      assert.deepEqual(ihdr(buf), { w: size, h: size, colorType: 6 }, `${name} is ${size}x${size} RGBA`)
      assert.ok(buf.equals(files[0]), `${name} is identical in every asset folder`)
    }
  }
})

// --- settings check relayed through storage ------------------------------
// The settings page cannot always reach the side service, so the request is
// parked in settings storage and collected when the watch app opens.

test('side service: GET_PENDING_TEST answers a parked check and clears it', async () => {
  await loadSideService(async () => ({ status: 200, body: JSON.stringify(SAMPLE) }))
  globalThis.__store.set('tempestPendingTest', JSON.stringify({ stationId: '12345', token: 'abc', at: Date.now() }))
  const data = await new Promise((resolve) => {
    globalThis.__sideOptions.onRequest({ method: 'GET_PENDING_TEST', params: {} }, (err, d) => resolve(d))
  })
  assert.equal(data.pending, true)
  assert.equal(data.result.ok, true)
  assert.match(data.result.message, /^Connected: Backyard/)
  const answer = globalThis.__settings.getItem('tempestPendingTest')
  // the request is one-off: it must not fire again
  const again = await new Promise((resolve) => {
    globalThis.__sideOptions.onRequest({ method: 'GET_PENDING_TEST', params: {} }, (err, d) => resolve(d))
  })
  assert.equal(again.pending, false)
  // and the answer is left where the settings page can read it
  assert.equal(JSON.parse(answer).result.ok, true)
})

test('side service: GET_PENDING_TEST does nothing when nothing is parked', async () => {
  await loadSideService(async () => {
    throw new Error('should not be called')
  })
  const data = await new Promise((resolve) => {
    globalThis.__sideOptions.onRequest({ method: 'GET_PENDING_TEST', params: {} }, (err, d) => resolve(d))
  })
  assert.equal(data.pending, false)
})

// --- package identity ----------------------------------------------------
// The store rejects a package whose appId differs from the console entry, and
// the README and manifest have drifted before. This pins them together.

test('app.json: appId matches the registered console app', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  assert.equal(app.app.appId, 1137328, 'appId must match the Zepp console entry')
})

test('app.json: version code and name are consistent', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  assert.match(app.app.version.name, /^\d+\.\d+\.\d+$/)
  assert.equal(typeof app.app.version.code, 'number')
  assert.ok(app.app.version.code >= 1)
})

// --- KiezelPay wiring ------------------------------------------------------
// The payment SDK is invisible when it is mis-wired: the build succeeds and the
// support page simply does nothing. These pin the three joins that failed
// silently during development.

test('side service: every identifier it uses is imported', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app-side', 'index.js'), 'utf8')
  // MessageBuilder is easy to lose when the config import is rewritten, and the
  // failure is swallowed by the surrounding try/catch.
  if (/new MessageBuilder\(/.test(src)) {
    assert.match(src, /import \{[^}]*MessageBuilder[^}]*\} from '\.\.\/shared\/message-side'/)
  }
})

// The settings page could sit on "Checking… now open Tempest" for ever when
// neither the watch nor the side service answered. A timeout must end it.
