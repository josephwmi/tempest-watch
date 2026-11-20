import * as hmUI from '@zos/ui'
import { px, log as Logger } from '@zos/utils'
import { BasePage } from '@zeppos/zml/base-page'
import { getDeviceInfo } from '@zos/device'
import { back } from '@zos/router'
import { getKpay } from './kpay'

const logger = Logger.getLogger('tempest-support')

// KiezelPay's own dialog page. It shows the payment code the buyer types in at
// kzl.io/code; the phone-side library polls until the code is paid and then
// tells this page, which closes itself. Nothing here is visible in the weather
// screens — if the library failed to start the page simply says so.
const { width: W, height: H } = getDeviceInfo()

const COLOR_BG = 0x000000
const COLOR_TEXT = 0xffffff
const COLOR_DIM = 0x8a94a6
const COLOR_ACCENT = 0x4dd0e1

Page(
  BasePage({
    state: {
      kpay: null,
      started: false
    },

    onInit() {
      const app = getApp()
      this.state.kpay = (app && app.globalData && app.globalData.kpay) || getKpay()
      if (this.state.kpay) {
        try {
          this.state.kpay.pageInit()
          this.state.started = true
        } catch (e) {
          logger.log('kpay pageInit failed: ' + (e && e.message ? e.message : e))
        }
      }
    },

    build() {
      hmUI.setStatusBarVisible(false)
      hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: W, h: H, color: COLOR_BG })

      if (!this.state.kpay) {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: px(60),
          y: px(150),
          w: W - px(120),
          h: px(140),
          text: 'Support is not set up\nin this build.',
          text_size: px(26),
          color: COLOR_DIM,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.WRAP
        })
      } else {
        try {
          this.state.kpay.pageBuild()
        } catch (e) {
          logger.log('kpay pageBuild failed: ' + (e && e.message ? e.message : e))
        }
      }

      const bw = px(150)
      const bh = px(58)

      // Cancelling stops the polling on the phone too, otherwise it keeps
      // checking a code the buyer has walked away from.
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: Math.floor((W - bw) / 2),
        y: H - bh - px(58),
        w: bw,
        h: bh,
        radius: bh / 2,
        text: 'Done',
        text_size: px(26),
        color: COLOR_TEXT,
        normal_color: 0x1b2430,
        press_color: COLOR_ACCENT,
        click_func: () => this.close()
      })
    },

    close() {
      if (this.state.kpay && this.state.kpay.messageBuilder) {
        try {
          this.state.kpay.messageBuilder.call({ method: 'KPAY_CANCEL_PURCHASE' })
        } catch (e) {
          // nothing to stop
        }
      }
      back()
    },

    onDestroy() {
      if (this.state.kpay && this.state.started) {
        try {
          this.state.kpay.pageDestroy()
        } catch (e) {
          // page is going away regardless
        }
      }
    }
  })
)
