import * as hmUI from '@zos/ui'
import { px, log as Logger } from '@zos/utils'
import { BasePage } from '@zeppos/zml/base-page'
import { getDeviceInfo, SCREEN_SHAPE_SQUARE } from '@zos/device'

import { ERR, isConfigured, normalizeConfig } from '../utils/constants'
import { comfortLabel, conditionLabel } from '../utils/format'
import { BTN_H, BTN_RADIUS, BTN_W, BTN_Y, BTN_FONT, RETRY_BTN } from './metrics'

const logger = Logger.getLogger('tempest-page')

// Amazfit Balance 2: round 480 x 480 AMOLED. The design width in app.json is
// 480 as well, so px() is 1:1 on this watch.
const { width: W, height: H } = getDeviceInfo()
const ROUND = getDeviceInfo().screenShape !== SCREEN_SHAPE_SQUARE

const COLOR_BG = 0x000000
const COLOR_TEXT = 0xffffff
const COLOR_DIM = 0x8a94a6
const COLOR_ACCENT = 0x4dd0e1
const COLOR_WARN = 0xffb74d
const COLOR_BTN = 0x1b2430

const PAGES = 4

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

function makeButton(text, x, y, w, h, onTap) {
  return hmUI.createWidget(hmUI.widget.BUTTON, {
    x: x,
    y: y,
    w: w,
    h: h,
    radius: h / 2,
    text: text,
    text_size: px(BTN_FONT),
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

      w.title = label({ x: px(40), y: px(38), w: W - px(80), h: px(34), text_size: px(22), color: COLOR_DIM })
      w.cond = label({ x: px(40), y: px(70), w: W - px(80), h: px(30), text_size: px(22), color: COLOR_ACCENT })

      // Page 1: temperature
      w.temp = label({ x: px(30), y: px(96), w: W - px(60), h: px(120), text_size: px(92) })
      w.feels = label({ x: px(40), y: px(214), w: W - px(80), h: px(30), text_size: px(24), color: COLOR_DIM })

      // Page 2: wind
      w.wind = label({ x: px(30), y: px(110), w: W - px(60), h: px(80), text_size: px(62) })
      w.windDir = label({ x: px(40), y: px(186), w: W - px(80), h: px(34), text_size: px(28), color: COLOR_ACCENT })
      w.gust = label({ x: px(40), y: px(222), w: W - px(80), h: px(30), text_size: px(24), color: COLOR_DIM })

      // Page 3: air
      w.hum = label({ x: px(30), y: px(110), w: W - px(60), h: px(80), text_size: px(62) })
      w.dew = label({ x: px(40), y: px(186), w: W - px(80), h: px(34), text_size: px(28), color: COLOR_ACCENT })
      w.press = label({ x: px(40), y: px(222), w: W - px(80), h: px(30), text_size: px(24), color: COLOR_DIM })

      // Page 4: sun, rain, lightning
      w.uv = label({ x: px(30), y: px(110), w: W - px(60), h: px(80), text_size: px(62) })
      w.rain = label({ x: px(40), y: px(186), w: W - px(80), h: px(34), text_size: px(28), color: COLOR_ACCENT })
      w.strike = label({ x: px(40), y: px(222), w: W - px(80), h: px(30), text_size: px(24), color: COLOR_DIM })

      // Status block: shown when there is no reading to show.
      w.status = label({
        x: px(50),
        y: px(96),
        w: W - px(100),
        h: px(170),
        text_size: px(26),
        color: COLOR_TEXT,
        text_style: hmUI.text_style.WRAP
      })

      const bw = px(BTN_W)
      const bh = px(BTN_H)
      const by = px(BTN_Y)
      w.prev = makeButton('<', px(30), by, bw, bh, () => this.turn(-1))
      w.next = makeButton('>', W - px(30) - bw, by, bw, bh, () => this.turn(1))
      w.refresh = makeButton('\u21bb', Math.floor((W - bw) / 2), by, bw, bh, () => this.load(true))

      // Page dots
      const dotY = px(BTN_Y + BTN_H + 26)
      const gap = px(18)
      const startX = Math.floor((W - (PAGES - 1) * gap) / 2)
      for (let i = 0; i < PAGES; i++) {
        this.state.dots.push(
          hmUI.createWidget(hmUI.widget.FILL_RECT, {
            x: startX + i * gap - px(3),
            y: dotY,
            w: px(6),
            h: px(6),
            radius: px(3),
            color: i === 0 ? COLOR_ACCENT : COLOR_BTN
          })
        )
      }

      // Full-width retry button for the error state.
      w.retry = hmUI.createWidget(hmUI.widget.BUTTON, {
        x: px(RETRY_BTN.x),
        y: px(RETRY_BTN.y),
        w: px(RETRY_BTN.w),
        h: px(RETRY_BTN.h),
        radius: px(RETRY_BTN.radius),
        text: RETRY_BTN.text,
        text_size: px(RETRY_BTN.font_size),
        color: 0x000000,
        normal_color: COLOR_ACCENT,
        press_color: 0x26a69a,
        click_func: () => this.load(true)
      })

      this.showPage(this.state.page)
      this.paintStatus()
      if (this.state.view) this.paintView()

      if (ROUND) {
        // nothing extra: layout is already centred for the round face
      }
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
      } else if (this.state.error === ERR.AUTH) {
        message = 'Tempest rejected the token.\nCheck the token in the app settings.'
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
      const names = ['temp', 'feels', 'wind', 'windDir', 'gust', 'hum', 'dew', 'press', 'uv', 'rain', 'strike']
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

    namesOnPage(name) {
      const pageOf = {
        temp: 0, feels: 0,
        wind: 1, windDir: 1, gust: 1,
        hum: 2, dew: 2, press: 2,
        uv: 3, rain: 3, strike: 3
      }
      return pageOf[name] === this.state.page
    },

    showPage(n) {
      this.state.page = (n + PAGES) % PAGES
      const w = this.state.widgets
      const names = ['temp', 'feels', 'wind', 'windDir', 'gust', 'hum', 'dew', 'press', 'uv', 'rain', 'strike']
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
