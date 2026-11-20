// Turns a Tempest REST observation into the small, already-formatted payload the
// watch draws. No @zos imports here: this file is unit-tested in Node.
//
// Source of the fields used: WeatherFlow Tempest REST API,
// GET https://swd.weatherflow.com/swd/rest/observations/station/<id>?token=<token>
//   -> { status, station_id, station_name, station_units, obs: [ { ... } ] }
// The observation object is always metric/SI (C, m/s, hPa, mm); the station's own
// unit preference only comes back in station_units, so we convert here.

const CARDINALS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
]

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

function round(v, digits) {
  if (v === null) return null
  const p = Math.pow(10, digits || 0)
  return Math.round(v * p) / p
}

export function cToF(c) {
  return c === null ? null : c * 9 / 5 + 32
}

export function mpsToMph(mps) {
  return mps === null ? null : mps * 2.2369362920544
}

export function mbToInHg(mb) {
  return mb === null ? null : mb * 0.0295299830714
}

export function mmToIn(mm) {
  return mm === null ? null : mm / 25.4
}

export function cardinal(deg) {
  if (deg === null) return '--'
  const i = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16
  return CARDINALS[i]
}

// Magnus-Tetens, as used by the Tempest API's own derived dew_point.
export function dewPointC(tC, rh) {
  if (tC === null || rh === null || rh <= 0) return null
  const a = 17.27
  const b = 237.7
  const g = (a * tC) / (b + tC) + Math.log(rh / 100)
  return (b * g) / (a - g)
}

export function pressureTrendWord(trend) {
  if (trend === 'rising') return 'Rising'
  if (trend === 'falling') return 'Falling'
  if (trend === 'steady') return 'Steady'
  return ''
}

function formatAge(epochSeconds, nowMs) {
  if (!epochSeconds) return ''
  const mins = Math.round((nowMs / 1000 - epochSeconds) / 60)
  if (mins < 1) return 'now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  return Math.floor(hrs / 24) + 'd ago'
}

// Picks the most recent observation out of the response.
export function pickObservation(payload) {
  if (!payload || !Array.isArray(payload.obs) || payload.obs.length === 0) return null
  return payload.obs[payload.obs.length - 1]
}

// Main entry: raw API payload -> view model for the watch.
// `nowMs` is injectable so the tests can pin it.
export function toViewModel(payload, cfg, nowMs) {
  const now = nowMs || Date.now()
  const obs = pickObservation(payload)
  if (!obs) return null

  const imperial = !cfg || cfg.units !== 'metric'
  const tC = num(obs.air_temperature)
  const rh = num(obs.relative_humidity)
  const windMps = num(obs.wind_avg)
  const gustMps = num(obs.wind_gust)
  const dir = num(obs.wind_direction)
  const pressureMb = num(obs.sea_level_pressure) !== null
    ? num(obs.sea_level_pressure)
    : num(obs.barometric_pressure)
  const feelsC = num(obs.feels_like)
  const dewC = num(obs.dew_point) !== null ? num(obs.dew_point) : dewPointC(tC, rh)
  const uv = num(obs.uv)
  const solar = num(obs.solar_radiation)
  const dayRainMm = num(obs.precip_accum_local_day)

  return {
    stationId: payload.station_id || (cfg && cfg.stationId) || '',
    stationName: payload.station_name || '',
    updatedAt: obs.timestamp || 0,
    age: formatAge(obs.timestamp, now),
    units: imperial ? 'imperial' : 'metric',

    temp: round(imperial ? cToF(tC) : tC, 1),
    tempUnit: imperial ? '\u00b0F' : '\u00b0C',
    feels: round(imperial ? cToF(feelsC) : feelsC, 1),
    feelsUnit: imperial ? '\u00b0F' : '\u00b0C',
    dew: round(imperial ? cToF(dewC) : dewC, 1),

    humidity: rh === null ? null : Math.round(rh),

    wind: round(imperial ? mpsToMph(windMps) : windMps, 1),
    gust: round(imperial ? mpsToMph(gustMps) : gustMps, 1),
    windUnit: imperial ? 'mph' : 'm/s',
    windDir: dir === null ? null : Math.round(dir),
    windCardinal: cardinal(dir),

    pressure: round(imperial ? mbToInHg(pressureMb) : pressureMb, imperial ? 2 : 1),
    pressureUnit: imperial ? 'inHg' : 'hPa',
    pressureTrend: pressureTrendWord(obs.pressure_trend),

    uv: uv === null ? null : round(uv, 1),
    solar: solar === null ? null : Math.round(solar),
    rainDay: round(imperial ? mmToIn(dayRainMm) : dayRainMm, 2),
    rainUnit: imperial ? 'in' : 'mm',
    rainLastHour: round(imperial ? mmToIn(num(obs.precip_accum_last_1hr)) : num(obs.precip_accum_last_1hr), 2),

    strikesLastHour: num(obs.lightning_strike_count_last_1hr) || 0,
    lastStrikeMiles: (function () {
      const km = num(obs.lightning_strike_last_distance)
      if (km === null) return null
      return round(imperial ? km * 0.621371 : km, imperial ? 1 : 1)
    })(),
    lastStrikeEpoch: num(obs.lightning_strike_last_epoch) || 0
  }
}

// Short condition line for the top of the screen, e.g. "Rain", "Partly cloudy".
// Tempest's observation endpoint has no sky-condition text, so this is derived
// from rain, lightning, daylight and UV only.
export function conditionLabel(vm) {
  if (!vm) return ''
  if (vm.strikesLastHour > 0) return 'Thunderstorm'
  if (vm.rainLastHour !== null && vm.rainLastHour > 0) return 'Raining'
  if (vm.solar !== null && vm.solar > 120) return 'Daylight'
  if (vm.solar !== null && vm.solar > 5) return 'Dusk / dawn'
  return 'Night'
}

// A one-word verdict on whether it is worth going outside right now.
export function comfortLabel(vm) {
  if (!vm || vm.temp === null) return ''
  const tF = vm.units === 'imperial' ? vm.temp : cToF(vm.temp)
  if (vm.strikesLastHour > 0) return 'Stay in'
  if (tF >= 95 || tF <= 15) return 'Extreme'
  if (tF >= 85 && vm.humidity !== null && vm.humidity >= 60) return 'Muggy'
  if (tF <= 35 && vm.wind !== null) {
    const mph = vm.units === 'imperial' ? vm.wind : mpsToMph(vm.wind)
    if (mph >= 12) return 'Bitter wind'
  }
  if (tF >= 60 && tF <= 82 && vm.rainLastHour === 0) return 'Pleasant'
  if (tF < 50) return 'Chilly'
  return 'Mild'
}
