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

// --- screen navigation: buttons and swipes --------------------------------
// The page module runs against stubbed @zos/* modules so the real gesture
// callback can be driven from Node. This proves the wiring and the decisions
// it makes; it says nothing about how the watch firmware delivers gestures.

test('nav: buttons wrap, swipes stop at the ends', async () => {
  const nav = await loadEsm('utils/nav.js')
  const G = { GESTURE_LEFT: 3, GESTURE_RIGHT: 4 }
  assert.equal(nav.PAGES, 5)
  assert.equal(nav.buttonTarget(0, -1), 4)
  assert.equal(nav.buttonTarget(4, 1), 0)
  assert.equal(nav.buttonTarget(2, 1), 3)
  for (let p = 0; p < 4; p++) assert.equal(nav.swipeTarget(p, G.GESTURE_LEFT, G), p + 1)
  for (let p = 1; p < 5; p++) assert.equal(nav.swipeTarget(p, G.GESTURE_RIGHT, G), p - 1)
  assert.equal(nav.swipeTarget(4, G.GESTURE_LEFT, G), null, 'no wrap past the last screen')
  assert.equal(nav.swipeTarget(0, G.GESTURE_RIGHT, G), null, 'no wrap before the first screen')
  assert.equal(nav.swipeTarget(2, 1, G), null, 'up/down are not handled')
  assert.equal(nav.swipeTarget(2, undefined, G), null)
  assert.equal(nav.swipeTarget(2, G.GESTURE_LEFT, null), null)
})

function loadWatchPage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tempest-page-'))
  const addExt = (src) => src.replace(/from '(\.\.?\/[^']+)'/g, (m, p) => "from '" + p + ".js'")
  for (const sub of ['page', 'utils']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true })
    for (const f of fs.readdirSync(path.join(ROOT, sub))) {
      if (!f.endsWith('.js')) continue
      fs.writeFileSync(path.join(dir, sub, f), addExt(fs.readFileSync(path.join(ROOT, sub, f), 'utf8')))
    }
  }
  const mod = (name, entry, body) => {
    const d = path.join(dir, 'node_modules', ...name.split('/'))
    fs.mkdirSync(d, { recursive: true })
    const pkg = { name, type: 'module', main: 'index.js' }
    if (entry) pkg.exports = { ['./' + entry]: './' + entry + '.js' }
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify(pkg))
    fs.writeFileSync(path.join(d, (entry || 'index') + '.js'), body)
  }
  mod('@zos/ui', null,
    'export const widget = { TEXT: "TEXT", BUTTON: "BUTTON", FILL_RECT: "FILL_RECT" }\n' +
    'export const align = { CENTER_H: 0, CENTER_V: 0 }\n' +
    'export const text_style = { NONE: 0, WRAP: 1 }\n' +
    'export const prop = { TEXT: "text", VISIBLE: "visible", COLOR: "color" }\n' +
    'export function createWidget(type, opts) { const w = { type, opts, props: {}, setProperty(k, v) { this.props[k] = v } }; globalThis.__widgets.push(w); return w }\n')
  mod('@zos/utils', null, 'export const px = (v) => v\nexport const log = { getLogger: () => ({ log() {}, error() {}, debug() {} }) }\n')
  mod('@zos/device', null, 'export const SCREEN_SHAPE_SQUARE = 0\nexport function getDeviceInfo() { return { width: 480, height: 480, screenShape: 1 } }\n')
  mod('@zos/interaction', null,
    'export const GESTURE_UP = 1, GESTURE_DOWN = 2, GESTURE_LEFT = 3, GESTURE_RIGHT = 4\n' +
    'export function onGesture(o) { globalThis.__gesture.on.push(typeof o === "function" ? o : o.callback) }\n' +
    'export function offGesture() { globalThis.__gesture.off++ }\n')
  mod('@zeppos/zml', 'base-page', 'export function BasePage(o) { return o }\n')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  globalThis.__widgets = []
  globalThis.__gesture = { on: [], off: 0 }
  globalThis.Page = (o) => { globalThis.__pageOptions = o }
  return import('file://' + path.join(dir, 'page', 'index.js').replace(/\\/g, '/')).then(() => {
    // Fresh state per test: the options object is shared with the module.
    const page = Object.assign({}, globalThis.__pageOptions)
    page.state = JSON.parse(JSON.stringify(page.state))
    page.state.widgets = {}
    page.state.dots = []
    page.request = () => new Promise(() => {})
    return page
  })
}

const READING = { ok: true, stationId: '1', temp: 20, tempUnit: 'C', feels: 20, feelsUnit: 'C', windCardinal: 'N', windDir: 0 }

test('page: swipes move between the five screens, no wrap at the ends', async () => {
  const page = await loadWatchPage()
  page.build()
  assert.equal(globalThis.__gesture.on.length, 1, 'one gesture listener registered in build()')
  const swipe = globalThis.__gesture.on[0]
  page.applyResult(READING) // a reading is showing, so the screen controls are up
  assert.equal(page.state.controlsVisible, true)
  const order = []
  for (let i = 0; i < 4; i++) {
    assert.equal(swipe(3), true, 'left swipe consumed')
    order.push(page.state.page)
  }
  assert.deepEqual(order, [1, 2, 3, 4])
  assert.equal(swipe(3), false, 'left swipe on the last screen is left to the system')
  assert.equal(page.state.page, 4)
  for (let i = 0; i < 4; i++) assert.equal(swipe(4), true, 'right swipe consumed')
  assert.equal(page.state.page, 0)
  assert.equal(swipe(4), false, 'right swipe on the first screen keeps the system back gesture')
  assert.equal(page.state.page, 0)
  assert.equal(swipe(1), false, 'up is not intercepted')
  assert.equal(swipe(2), false, 'down is not intercepted')
  // the active dot follows the swipe
  swipe(3)
  const dots = page.state.dots.map((d) => d.props.color)
  assert.equal(dots.filter((c) => c === 0x4dd0e1).length, 1)
  assert.equal(dots[1], 0x4dd0e1)
})

test('page: < / > buttons still work and still wrap', async () => {
  const page = await loadWatchPage()
  page.build()
  page.applyResult(READING)
  const w = page.state.widgets
  assert.equal(typeof w.prev.opts.click_func, 'function')
  assert.equal(typeof w.next.opts.click_func, 'function')
  w.prev.opts.click_func()
  assert.equal(page.state.page, 4, '< on the first screen wraps to Support')
  w.next.opts.click_func()
  assert.equal(page.state.page, 0, '> on Support wraps to Temperature')
  w.next.opts.click_func()
  assert.equal(page.state.page, 1)
  // buttons and swipes share the same page state
  assert.equal(globalThis.__gesture.on[0](4), true)
  assert.equal(page.state.page, 0)
})

test('page: swipes are ignored while the status block hides the screens', async () => {
  const page = await loadWatchPage()
  page.build() // no reading yet: status text is shown, controls hidden
  assert.equal(page.state.controlsVisible, false)
  assert.equal(globalThis.__gesture.on[0](3), false)
  assert.equal(page.state.page, 0)
})

test('page: the gesture listener is removed in onDestroy', async () => {
  const page = await loadWatchPage()
  page.build()
  assert.equal(typeof page.onDestroy, 'function')
  page.onDestroy()
  assert.equal(globalThis.__gesture.off, 1)
})
