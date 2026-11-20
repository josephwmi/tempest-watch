// Builds a scannable QR code for installing the app on a watch through the
// Zepp app's Developer Mode. The Zepp app wants a zpkd1:// link to a public
// HTTPS address that serves the .zab file.
//
//   node scripts/make-qr.cjs https://your.host/tempest-watch-balance2.zab
//
// Writes docs/install-qr.png and prints the URL it encoded.
const fs = require('fs')
const path = require('path')
const QR = require('qrcode')

const input = process.argv[2]
if (!input) {
  console.error('Usage: node scripts/make-qr.cjs <public https URL of the .zab file>')
  process.exit(1)
}
const target = /^https?:\/\//.test(input) ? input : 'https://' + input
const encoded = 'zpkd1://' + target.replace(/^https?:\/\//, '')

const outDir = path.join(__dirname, '..', 'docs')
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, 'install-qr.png')

QR.toFile(out, encoded, { width: 640, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
  .then(() => {
    console.log('QR written to ' + out)
    console.log('It encodes: ' + encoded)
    console.log('The watch downloads: ' + target)
  })
  .catch((err) => {
    console.error('Could not write the QR code: ' + err.message)
    process.exit(1)
  })
