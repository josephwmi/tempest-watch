// Applies Tempest's round-screen layout to the KiezelPay SDK.
//
// Why a patch and not a wrapper: the SDK builds its payment dialog inside
// pageBuild(), with widget positions hard-coded for a phone-shaped screen. On a
// 480x480 round watch its lower lines fall outside the circle. The dialog is
// created by the library itself (KpayApp.pageBuild), so the only way to lay it
// out for this watch is to replace that one method.
//
// Run by `npm install` (postinstall) and by `npm run build`, so a fresh clone or
// a dependency reinstall can never ship the phone-shaped dialog by accident.
// Re-running is safe: the patch is detected and not applied twice.

const fs = require('fs')
const path = require('path')

const TARGET = path.join(__dirname, '..', 'node_modules', 'kpay-amazfit', 'app', 'index.js')

const MARKER = 'TEMPEST_ROUND_LAYOUT'
const START = '  pageBuild() {'
const END = '  pageDestroy() {'

const PATCH = `  pageBuild() {
    // ${MARKER}: KiezelPay's dialog is laid out for a phone-shaped screen; on a
    // round 480 watch its lower lines fall outside the circle. Keep the two
    // things the buyer needs -- the words and the code -- inside the circle, and
    // leave room for the app's own Done button underneath.
    const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = getDeviceInfo();

    this.paymentInstructions = createWidget(widget.TEXT, {
      x: Math.round(DEVICE_WIDTH * 0.125),
      y: Math.round(DEVICE_HEIGHT * 0.14),
      w: Math.round(DEVICE_WIDTH * 0.75),
      h: Math.round(DEVICE_HEIGHT * 0.3),
      color: 0xffffff,
      text_size: Math.round(DEVICE_WIDTH / 22),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.WRAP,
      text: getKPayText('PurchaseStarted'),
    });

    this.paymentCodeElement = createWidget(widget.TEXT, {
      x: 0,
      y: Math.round(DEVICE_HEIGHT * 0.44),
      w: DEVICE_WIDTH,
      h: Math.round(DEVICE_HEIGHT * 0.16),
      color: 0x4dd0e1,
      text_size: Math.round(DEVICE_WIDTH / 7),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: localStorage.getItem(LS_PAYMENTCODE),
    });

    this.alreadyPaidTitle = createWidget(widget.TEXT, {
      x: 0,
      y: Math.round(DEVICE_HEIGHT * 0.62),
      w: DEVICE_WIDTH,
      h: Math.round(DEVICE_HEIGHT * 0.06),
      color: 0xffffff,
      text_size: Math.round(DEVICE_WIDTH / 24),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: getKPayText('AlreadyPaidTitle'),
    });

    this.alreadyPaidMsg = createWidget(widget.TEXT, {
      x: 0,
      y: Math.round(DEVICE_HEIGHT * 0.68),
      w: DEVICE_WIDTH,
      h: Math.round(DEVICE_HEIGHT * 0.06),
      color: 0x8a94a6,
      text_size: Math.round(DEVICE_WIDTH / 26),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: getKPayText('AlreadyPaidMsg'),
    });
  }

`

function main() {
  if (!fs.existsSync(TARGET)) {
    // Nothing installed yet, or the dependency was removed: not an error.
    console.log('kpay patch: SDK not installed, nothing to do')
    return 0
  }

  const src = fs.readFileSync(TARGET, 'utf8')

  if (src.includes(MARKER)) {
    console.log('kpay patch: already applied')
    return 0
  }

  const start = src.indexOf(START)
  const end = src.indexOf(END)
  if (start < 0 || end < 0 || end < start) {
    // The SDK changed shape. Failing loudly beats shipping a dialog that spills
    // off the watch, because nothing else would reveal it.
    console.error(
      'kpay patch: could not find pageBuild()/pageDestroy() in ' + TARGET + '\n' +
        'The KiezelPay SDK has changed; check its dialog layout for the round screen.'
    )
    return 1
  }

  fs.writeFileSync(TARGET, src.slice(0, start) + PATCH + src.slice(end))
  console.log('kpay patch: round-screen layout applied')
  return 0
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = { TARGET, MARKER, main }
