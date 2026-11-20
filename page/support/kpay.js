import { push, back } from '@zos/router'
import { log as Logger } from '@zos/utils'
import { MessageBuilder } from '../../shared/message'
import { getPackageInfo } from '@zos/app'
import * as ble from '@zos/ble'


// Direct import, not require(): a bare require() of a dependency is tree-shaken
// out by the bundler and the payment screen then fails at runtime.
import KpayApp from 'kpay-amazfit/app'

const logger = Logger.getLogger('tempest-kpay')

// KiezelPay is two halves: a page on the watch showing the payment code, and a
// client on the phone asking api.kiezelpay.com whether that code has been paid.
// The library is written against the raw MessageBuilder rather than ZML, so this
// module owns the only raw builder in the app; everything else uses request().
const DIALOG_PATH = 'page/support/index'

// Written here rather than imported: the bundler drops a config that reaches a
// page only through an import, and the payment screen then has no product id.
const KPAY_PRODUCT_ID = '1477462642'

function kpayConfig() {
  return { id: parseInt(KPAY_PRODUCT_ID, 10), trialEnabled: false, testMode: false }
}

const messageBuilder = new MessageBuilder({
  appId: getPackageInfo().appId,
  appDevicePort: 20,
  appSidePort: 0,
  ble
})
messageBuilder.connect()

const kpay = new KpayApp(
  Object.assign({}, kpayConfig(), {
    dialogPath: DIALOG_PATH,
    messageBuilder: messageBuilder
  })
)

let started = false

export function startKpay(app) {
  if (started) return kpay
  started = true
  try {
    kpay.init()
    if (app && app.globalData) app.globalData.kpay = kpay
    logger.log('kpay started')
  } catch (e) {
    logger.log('kpay init failed: ' + (e && e.message ? e.message : e))
  }
  return kpay
}

export function getKpay() {
  return kpay
}

export function isLicensed() {
  if (!kpay) return false
  try {
    return kpay.isLicensed()
  } catch (e) {
    return false
  }
}

export function startPurchase() {
  if (!kpay) return false
  try {
    kpay.startPurchase()
    return true
  } catch (e) {
    logger.log('startPurchase failed: ' + (e && e.message ? e.message : e))
    return false
  }
}

export function showSupportPage() {
  push({ url: DIALOG_PATH })
}

export function leaveSupportPage() {
  back()
}
