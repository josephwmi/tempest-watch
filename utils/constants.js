// Shared between the watch page, the phone side service and the settings page.
// Keep this file free of any @zos/* imports.

export const SETTINGS_KEY = 'tempestConfig'
export const CACHE_KEY = 'tempestCache'
// One-off check requested from the settings page, answered by the side service.
export const PENDING_KEY = 'tempestPendingTest'

// Personal Access Token from tempestwx.com -> Settings -> Data Authorizations.
// Required: swd.weatherflow.com answers every request without a token with
// HTTP 401 {"status_code":401,"status_message":"UNAUTHORIZED"} (checked
// 2026-11-24), so the app needs both the station ID and the token.
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
  NO_TOKEN: 'NO_TOKEN',
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

// A station ID is set (digits only).
export function isConfigured(cfg) {
  return !!(cfg && /^\d+$/.test(cfg.stationId))
}

// A token is set. Tempest rejects requests without one, so nothing is fetched
// until this is true.
export function hasToken(cfg) {
  return !!(cfg && typeof cfg.token === 'string' && cfg.token.trim().length > 0)
}

// Both pieces Tempest needs are present.
export function isReady(cfg) {
  return isConfigured(cfg) && hasToken(cfg)
}

// Accepts a bare id, a URL containing the id, or a JSON blob pasted by mistake.
export function extractStationId(input) {
  const s = String(input == null ? '' : input).trim()
  if (/^\d+$/.test(s)) return s
  const m = s.match(/(?:station\/|station_id["':\s=]+)(\d{3,})/i)
  return m ? m[1] : s
}
