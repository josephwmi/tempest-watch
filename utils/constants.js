// Shared between the watch page, the phone side service and the settings page.
// Keep this file free of any @zos/* imports.

export const SETTINGS_KEY = 'tempestConfig'
export const CACHE_KEY = 'tempestCache'

// Personal Access Token from tempestwx.com -> Settings -> Data Authorizations.
// Optional: it is only needed if you prefer "stations/<token>" lookups; the
// plain station-id endpoint works with a station id alone.
export const DEFAULT_CONFIG = {
  stationId: '',
  token: '',
  units: 'imperial', // 'imperial' (F, mph, inHg, in) or 'metric' (C, m/s, hPa, mm)
  autoRefresh: true
}

export const API_HOST = 'https://swd.weatherflow.com/swd/rest/observations/station/'

// `message` is what we show; `status` is what the app uses.
export const ERR = {
  NO_STATION: 'NO_STATION',
  BAD_STATION: 'BAD_STATION',
  AUTH: 'AUTH',
  HTTP: 'HTTP',
  NETWORK: 'NETWORK',
  BAD_DATA: 'BAD_DATA'
}

export function normalizeConfig(raw) {
  const cfg = Object.assign({}, DEFAULT_CONFIG, raw || {})
  cfg.stationId = String(cfg.stationId == null ? '' : cfg.stationId).trim()
  cfg.token = String(cfg.token == null ? '' : cfg.token).trim()
  cfg.units = cfg.units === 'metric' ? 'metric' : 'imperial'
  cfg.autoRefresh = cfg.autoRefresh !== false
  return cfg
}

export function isConfigured(cfg) {
  return !!(cfg && /^\d+$/.test(cfg.stationId))
}

// Accepts a bare id, a URL containing the id, or a JSON blob pasted by mistake.
export function extractStationId(input) {
  const s = String(input == null ? '' : input).trim()
  if (/^\d+$/.test(s)) return s
  const m = s.match(/(?:station\/|station_id["':\s=]+)(\d{3,})/i)
  return m ? m[1] : s
}
