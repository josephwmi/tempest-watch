import { BaseSideService, settingsLib } from '@zeppos/zml/base-side'
import {
  API_HOST,
  PENDING_KEY,
  CACHE_KEY,
  ERR,
  SETTINGS_KEY,
  extractStationId,
  isConfigured,
  normalizeConfig
} from '../utils/constants'
import { toViewModel } from '../utils/format'

function readConfig() {
  const raw = settingsLib.getItem(SETTINGS_KEY)
  if (!raw) return normalizeConfig({})
  try {
    return normalizeConfig(JSON.parse(raw))
  } catch (e) {
    return normalizeConfig({})
  }
}

function readCache() {
  const raw = settingsLib.getItem(CACHE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function writeCache(payload) {
  try {
    settingsLib.setItem(CACHE_KEY, JSON.stringify(payload))
  } catch (e) {
    // cache is best effort
  }
}

function buildUrl(cfg) {
  const id = encodeURIComponent(extractStationId(cfg.stationId))
  // WeatherFlow accepts either ?token=... or a Bearer header; use the query
  // form because it is what their own examples show.
  const token = cfg.token ? '?token=' + encodeURIComponent(cfg.token) : ''
  return API_HOST + id + token
}

// One call to Tempest, mapped to { ok: true, payload } or { ok: false, error, message }.
function fetchObservation(cfg) {
  const url = buildUrl(cfg)
  const timeout = 12000
  return fetch({
    url: url,
    method: 'GET',
    headers: { Accept: 'application/json' },
    timeout: timeout
  })
    .then(function (response) {
      const status = response && response.status
      let body = response && response.body
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch (e) {
          body = null
        }
      }
      if (status === 401 || status === 403) {
        return { ok: false, error: ERR.AUTH, message: 'Token rejected by Tempest' }
      }
      if (status === 404) {
        return { ok: false, error: ERR.BAD_STATION, message: 'Station ' + cfg.stationId + ' not found' }
      }
      if (status && status >= 400) {
        return { ok: false, error: ERR.HTTP, message: 'Tempest returned HTTP ' + status }
      }
      if (!body || !Array.isArray(body.obs) || body.obs.length === 0) {
        return { ok: false, error: ERR.BAD_DATA, message: 'No observations in response' }
      }
      const apiStatus = body.status && body.status.status_code
      if (apiStatus && apiStatus !== 0) {
        return {
          ok: false,
          error: apiStatus === 401 ? ERR.AUTH : ERR.HTTP,
          message: (body.status && body.status.status_message) || 'Tempest API error'
        }
      }
      return { ok: true, payload: body }
    })
    .catch(function (error) {
      const msg = (error && (error.message || error.toString())) || 'unknown'
      const timedOut = /timeout|timed out/i.test(msg)
      return {
        ok: false,
        error: timedOut ? ERR.NETWORK : ERR.NETWORK,
        message: timedOut ? 'Tempest did not answer in time' : 'No connection to Tempest'
      }
    })
}

function getWeather(res, force) {
  const cfg = readConfig()
  if (!isConfigured(cfg)) {
    res(null, {
      ok: false,
      error: ERR.NO_STATION,
      message: 'Set your Tempest station ID in the Zepp app',
      config: cfg
    })
    return
  }
  const cache = readCache()
  const fresh = cache && cache.stationId === cfg.stationId &&
    Date.now() - (cache.fetchedAt || 0) < 60000
  if (!force && fresh) {
    res(null, Object.assign({ ok: true, cached: true, config: cfg }, cache.view))
    return
  }
  fetchObservation(cfg).then(function (result) {
    if (!result.ok) {
      // Keep showing the last good reading rather than an empty screen.
      const stale = cache && cache.stationId === cfg.stationId ? cache.view : null
      res(null, {
        ok: false,
        error: result.error,
        message: result.message,
        config: cfg,
        stale: stale
      })
      return
    }
    const view = toViewModel(result.payload, cfg)
    if (!view) {
      res(null, { ok: false, error: ERR.BAD_DATA, message: 'Could not read the observation', config: cfg })
      return
    }
    const entry = { stationId: cfg.stationId, fetchedAt: Date.now(), view: view }
    writeCache(entry)
    res(null, Object.assign({ ok: true, config: cfg }, view))
  })
}

// The settings page asks for a check; this is the only place on the phone that
// does HTTP, so the test uses exactly the code path the watch uses.
function testConnection(res, params) {
  const cfg = normalizeConfig({
    stationId: params && params.stationId,
    token: params && params.token
  })
  if (!isConfigured(cfg)) {
    res(null, { ok: false, message: 'Enter a station ID first.' })
    return
  }
  fetchObservation(cfg).then(function (result) {
    if (!result.ok) {
      res(null, { ok: false, error: result.error, message: result.message })
      return
    }
    const view = toViewModel(result.payload, cfg)
    if (!view) {
      res(null, { ok: false, message: 'The station answered but the reading was empty.' })
      return
    }
    const t = view.temp === null ? '--' : Math.round(view.temp) + view.tempUnit
    res(null, {
      ok: true,
      stationName: view.stationName || cfg.stationId,
      message:
        'Connected: ' + (view.stationName || cfg.stationId) + ' \u2014 ' + t + ', ' +
        (view.humidity === null ? '--' : view.humidity + '% RH')
    })
  })
}

// The settings page cannot always reach this service, so it leaves the check it
// wants in settings storage. The watch app asks for it the moment it opens, and
// the answer is written back for the settings page to show.
function takePendingTest() {
  let raw = null
  try {
    raw = settingsLib.getItem(PENDING_KEY)
  } catch (e) {
    return null
  }
  if (!raw) return null
  try {
    settingsLib.removeItem(PENDING_KEY)
  } catch (e) {
    settingsLib.setItem(PENDING_KEY, '')
  }
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function answerPendingTest(result) {
  try {
    settingsLib.setItem(PENDING_KEY, JSON.stringify({ result: result, at: Date.now() }))
  } catch (e) {
    // nothing else to do; the settings page will simply not see a result
  }
}

function getPendingTest(res) {
  const pending = takePendingTest()
  if (!pending || !pending.stationId) {
    res(null, { pending: false })
    return
  }
  testConnection(
    function (err, data) {
      if (err) return
      answerPendingTest(data)
      res(null, { pending: true, result: data })
      try {
        this.call({ method: 'TEST_RESULT', params: data })
      } catch (e) {
        // the settings page may not be listening; the stored answer covers that
      }
    },
    pending
  )
}

function getConfig(res) {
  res(null, { config: readConfig() })
}

AppSideService(
  BaseSideService({
    onInit() {},
    onRequest(req, res) {
      if (req.method === 'GET_WEATHER') {
        getWeather(res, req.params && req.params.force)
      } else if (req.method === 'GET_CONFIG') {
        getConfig(res)
      } else if (req.method === 'TEST_CONNECTION') {
        testConnection(res, req.params)
      } else if (req.method === 'GET_PENDING_TEST') {
        getPendingTest(res)
      } else {
        res({ message: 'unknown method ' + req.method })
      }
    },
    // The settings page on the phone writes to settingsStorage; push the change
    // to the watch and refresh straight away.
    onSettingsChange() {
      const cfg = readConfig()
      this.call({ method: 'CONFIG_CHANGED', params: { config: cfg } })
      if (isConfigured(cfg)) {
        getWeather(
          function (err, data) {
            if (err) return
            this.call({ method: 'WEATHER', params: data })
          }.bind(this),
          true
        )
      }
    },
    onRun() {},
    onDestroy() {}
  })
)
