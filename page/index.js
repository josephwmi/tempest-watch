import * as hmUI from '@zos/ui'
import { log as Logger } from '@zos/utils'
import { BasePage } from '@zeppos/zml/base-page'
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from '@zos/device'

import { ERR, hasToken, isConfigured, normalizeConfig } from '../utils/constants'
import { comfortLabel, conditionLabel } from '../utils/format'

import { computeLayout, dotX, RETRY_TEXT } from './metrics'

const logger = Logger.getLogger('tempest-page')

// Real screen size and shape of whichever watch this runs on (round 360-480,
// square 320 x 380 / 390 x 450). Every widget position comes from
// computeLayout(), so nothing here is tied to one watch.
const DEVICE = getDeviceInfo()
const W = DEVICE.width
const H = DEVICE.height
const ROUND = DEVICE.screenShape !== SCREEN_SHAPE_SQUARE
const L = computeLayout(W, H, ROUND)

const COLOR_BG = 0x000000
const COLOR_TEXT = 0xffffff
const COLOR_DIM = 0x8a94a6
const COLOR_ACCENT = 0x4dd0e1
const COLOR_WARN = 0xffb74d
const COLOR_BTN = 0x1b2430

const PAGES = 5

// Support screen text. Plain single-quoted string, so '$JosephWMI' is literal
// (no template-literal interpolation).
const SUPPORT_TEXT = 'Thanks for downloading this app! To donate: CashApp: $JosephWMI'

function label(opts) {
  return hmUI.createWidget(hmUI.widget.TEXT, Object.assign({
    color: COLOR_TEXT,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.NONE
  }, opts))
}

function setText(widget, text) {
  if (!widget) return
  const value = text === null || text === undefined ? '--' : String(text)
  widget.setProperty(hmUI.prop.TEXT, value)
}

function makeButton(text, r, font, onTap) {
  return hmUI.createWidget(hmUI.widget.BUTTON, {
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    radius: r.radius,
    text: text,
    text_size: font,
    color: COLOR_TEXT,
    normal_color: COLOR_BTN,
    press_color: COLOR_ACCENT,
    click_func: onTap
  })
}

Page(
  BasePage({
    state: {
      view: null,
      config: null,
      error: null,
      errorText: '',
      loading: false,
      page: 0,
      widgets: {},
      dots: [],
      errorShown: false,
      stale: false
    },

    onInit() {
      logger.log('page onInit')
      this.request({ method: 'GET_CONFIG', params: {} })
        .then((data) => {
          this.state.config = normalizeConfig(data && data.config)
          this.paintStatus()
          if (isConfigured(this.state.config)) this.load(false)
          this.collectPendingTest()
        })
        .catch(() => {
          this.state.config = normalizeConfig({})
          this.paintStatus()
        })
    },

// The phone's settings page cannot always reach the side service. When it
    // asks for a station check it leaves the request in storage, and the watch
    // app picks it up here the moment it opens.
    collectPendingTest() {
      this.request({ method: 'GET_PENDING_TEST', params: {} })
        .then((data) => {
          if (!data || !data.pending) return
          logger.log('answered a settings check: ' + (data.result && data.result.ok))
        })
        .catch(() => {})
    },

    onResume() {
      // Come back from the Zepp app with a station ID filled in, or just reopen.
      if (this.state.config && isConfigured(this.state.config)) this.load(false)
    },

    build() {
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0,
        y: 0,
        w: W,
        h: H,
        color: COLOR_BG
      })

      const w = this.state.widgets
      const text = (r, extra) => label(Object.assign({ x: r.x, y: r.y, w: r.w, h: r.h, text_size: r.font }, extra))

      w.title = text(L.title, { color: COLOR_DIM })
      w.cond = text(L.cond, { color: COLOR_ACCENT })

      // Page 1: temperature
      w.temp = text(L.temp)
      w.feels = text(L.feels, { color: COLOR_DIM })

      // Pages 2-4 share three rows: a big number, an accent line, a dim line.
      w.wind = text(L.big)
      w.windDir = text(L.mid, { color: COLOR_ACCENT })
      w.gust = text(L.small, { color: COLOR_DIM })

      w.hum = text(L.big)
      w.dew = text(L.mid, { color: COLOR_ACCENT })
      w.press = text(L.small, { color: COLOR_DIM })

      w.uv = text(L.big)
      w.rain = text(L.mid, { color: COLOR_ACCENT })
      w.strike = text(L.small, { color: COLOR_DIM })

      // Status block: shown when there is no reading to show.
      w.status = text(L.status, { color: COLOR_TEXT, text_style: hmUI.text_style.WRAP })

      const B = L.buttons
      w.prev = makeButton('<', B.prev, B.font, () => this.turn(-1))
      w.refresh = makeButton('\u21bb', B.refresh, B.font, () => this.load(true))
      w.next = makeButton('>', B.next, B.font, () => this.turn(1))

      // Page 5: support. A thank-you, nothing to buy and nothing gated.
      w.supTitle = text(L.supTitle, { color: COLOR_TEXT })
      w.supBody = text(L.supBody, { color: COLOR_DIM, text_style: hmUI.text_style.WRAP })

      // Page dots
      for (let i = 0; i < PAGES; i++) {
        this.state.dots.push(
          hmUI.createWidget(hmUI.widget.FILL_RECT, {
            x: dotX(L, i, PAGES),
            y: L.dots.y,
            w: L.dots.size,
            h: L.dots.size,
            radius: Math.floor(L.dots.size / 2),
            color: i === 0 ? COLOR_ACCENT : COLOR_BTN
          })
        )
      }

      // Wide retry button for the error state.
      w.retry = hmUI.createWidget(hmUI.widget.BUTTON, {
        x: L.retry.x,
        y: L.retry.y,
        w: L.retry.w,
        h: L.retry.h,
        radius: L.retry.radius,
        text: RETRY_TEXT,
        text_size: L.retry.font,
        color: 0x000000,
        normal_color: COLOR_ACCENT,
        press_color: 0x26a69a,
        click_func: () => this.load(true)
      })

      this.showPage(this.state.page)
      this.paintStatus()
      if (this.state.view) this.paintView()
      this.paintSupport()
    },

    onCall(req) {
      const params = (req && req.params) || {}
      if (params.config) {
        this.state.config = normalizeConfig(params.config)
        this.paintStatus()
      }
      if (params.ok !== undefined) this.applyResult(params)
    },

    load(force) {
      if (this.state.loading) return
      this.state.loading = true
      this.state.error = null
      this.paintStatus()
      this.request({ method: 'GET_WEATHER', params: { force: !!force } })
        .then((data) => this.applyResult(data))
        .catch(() => {
          this.state.loading = false
          this.state.error = ERR.NETWORK
          this.state.errorText = 'Could not reach the phone app'
          this.paintStatus()
        })
    },

    applyResult(data) {
      this.state.loading = false
      const params = data || {}
      if (params.config) this.state.config = normalizeConfig(params.config)
      if (params.ok) {
        this.state.view = params
        this.state.error = null
        this.state.stale = !!params.cached
        this.paintView()
        this.paintSupport()
      } else {
        this.state.error = params.error || ERR.NETWORK
        this.state.errorText = params.message || 'Something went wrong'
        if (params.stale) {
          this.state.view = params.stale
          this.state.stale = true
          this.paintView()
        }
      }
      this.paintStatus()
    },

    paintView() {
      const v = this.state.view
      if (!v) return
      const w = this.state.widgets

      setText(w.title, v.stationName || ('Station ' + (v.stationId || '')))
      setText(w.cond, conditionLabel(v) + '  \u00b7  ' + (v.age || ''))

      setText(w.temp, v.temp === null ? '--' : Math.round(v.temp) + v.tempUnit)
      setText(
        w.feels,
        (v.feels === null ? 'Feels --' : 'Feels ' + Math.round(v.feels) + v.feelsUnit) +
          '  \u00b7  ' + comfortLabel(v)
      )

      setText(w.wind, v.wind === null ? '--' : v.wind + ' ' + v.windUnit)
      setText(w.windDir, v.windCardinal + (v.windDir === null ? '' : '  ' + v.windDir + '\u00b0'))
      setText(w.gust, v.gust === null ? 'Gust --' : 'Gust ' + v.gust + ' ' + v.windUnit)

      setText(w.hum, v.humidity === null ? '--' : v.humidity + '%')
      setText(w.dew, v.dew === null ? 'Dew point --' : 'Dew point ' + Math.round(v.dew) + v.tempUnit)
      setText(
        w.press,
        (v.pressure === null ? '--' : v.pressure + ' ' + v.pressureUnit) +
          (v.pressureTrend ? '  ' + v.pressureTrend : '')
      )

      setText(w.uv, v.uv === null ? 'UV --' : 'UV ' + v.uv)
      setText(w.rain, 'Rain today ' + (v.rainDay === null ? '--' : v.rainDay + ' ' + v.rainUnit))
      setText(
        w.strike,
        v.strikesLastHour > 0
          ? 'Lightning: ' + v.strikesLastHour + ' in the last hour'
          : (v.solar === null ? 'Solar --' : 'Solar ' + v.solar + ' W/m\u00b2')
      )
    },

    paintStatus() {
      const w = this.state.widgets
      if (!w.status) return
      const hasView = !!this.state.view
      const cfg = this.state.config
      let message = ''
      let retry = false

      if (this.state.loading && !hasView) {
        message = 'Fetching from Tempest\u2026'
      } else if (this.state.error === ERR.NO_STATION || (cfg && !isConfigured(cfg))) {
        message = 'No station set.\nOpen Zepp \u203a Profile \u203a Tempest\nand enter your station ID.'
      } else if (this.state.error === ERR.NO_TOKEN || (cfg && !hasToken(cfg))) {
        message = 'No access token set.\nOpen Zepp \u203a Profile \u203a Tempest\nand enter your token.'
      } else if (this.state.error === ERR.AUTH) {
        message = 'Tempest rejected the token.\nCheck it in the app settings.'
        retry = true
      } else if (this.state.error === ERR.BAD_STATION) {
        message = 'That station ID was not found.\nCheck it in the app settings.'
      } else if (this.state.error === ERR.BAD_DATA) {
        message = 'The station sent no reading.\nIs the Tempest online?'
        retry = true
      } else if (this.state.error === ERR.HTTP || this.state.error === ERR.NETWORK) {
        message = this.state.errorText || 'Could not reach Tempest.'
        retry = true
      } else if (!hasView && !this.state.loading) {
        message = 'No reading yet.\nTap \u21bb to fetch.'
        retry = true
      }

      const showStatus = !!message
      w.status.setProperty(hmUI.prop.VISIBLE, showStatus)
      w.status.setProperty(hmUI.prop.TEXT, message)
      w.retry.setProperty(hmUI.prop.VISIBLE, showStatus && retry)

      const pageVisible = !showStatus
      const names = ['temp', 'feels', 'wind', 'windDir', 'gust', 'hum', 'dew', 'press', 'uv', 'rain', 'strike', 'supTitle', 'supBody']
      names.forEach((n) => {
        if (w[n]) w[n].setProperty(hmUI.prop.VISIBLE, pageVisible && this.namesOnPage(n))
      })
      w.cond.setProperty(hmUI.prop.VISIBLE, hasView)
      w.title.setProperty(hmUI.prop.VISIBLE, true)
      // Re-run the colour refresh for the dots on the page we are on
      this.state.dots.forEach((d, i) => {
        d.setProperty(hmUI.prop.COLOR, i === this.state.page ? COLOR_ACCENT : COLOR_BTN)
      })
      const controls = ['prev', 'next', 'refresh']
      controls.forEach((n) => {
        if (w[n]) w[n].setProperty(hmUI.prop.VISIBLE, pageVisible)
      })
      this.state.dots.forEach((d) => d.setProperty(hmUI.prop.VISIBLE, pageVisible))
    },

    paintSupport() {
      const w = this.state.widgets
      if (!w.supTitle) return
      // The screen shows exactly SUPPORT_TEXT and nothing else, so the title stays empty.
      setText(w.supTitle, '')
      setText(w.supBody, SUPPORT_TEXT)
    },

    namesOnPage(name) {
      const pageOf = {
        temp: 0, feels: 0,
        wind: 1, windDir: 1, gust: 1,
        hum: 2, dew: 2, press: 2,
        uv: 3, rain: 3, strike: 3,
        supTitle: 4, supBody: 4
      }
      return pageOf[name] === this.state.page
    },

    showPage(n) {
      this.state.page = (n + PAGES) % PAGES
      const w = this.state.widgets
      const names = ['temp', 'feels', 'wind', 'windDir', 'gust', 'hum', 'dew', 'press', 'uv', 'rain', 'strike', 'supTitle', 'supBody']
      names.forEach((name) => {
        if (w[name]) w[name].setProperty(hmUI.prop.VISIBLE, this.namesOnPage(name))
      })
      this.state.dots.forEach((d, i) => {
        d.setProperty(hmUI.prop.COLOR, i === this.state.page ? COLOR_ACCENT : COLOR_BTN)
      })
    },

    turn(dir) {
      this.showPage(this.state.page + dir)
    }
  })
)
