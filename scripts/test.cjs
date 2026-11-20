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
  for (const sub of ['utils', 'app-side']) {
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
