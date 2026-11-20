# Tempest for Zepp OS (Amazfit)

A watch app that shows live conditions from your own **WeatherFlow Tempest**
personal weather station: temperature, feels-like, humidity, dew point, wind and
gust, pressure and trend, UV, solar, rain today and lightning.

- Watch UI: `page/index.js` (Zepp OS 3.0+, `@zos/ui`) — tuned for the **Amazfit Balance 2** (round 480 x 480, AMOLED)
- Phone side service: `app-side/index.js` — all HTTP happens here, because the
  watch itself has no internet
- Settings page: `setting/index.js` — where you enter the station ID
- Mapping and unit conversion: `utils/format.js` (pure JS, unit tested)
- Tests: `npm test` (11 tests, no watch needed)

## How it works

```
Watch app  ──request──▶  app-side (phone, in the Zepp app)
                                │  GET https://swd.weatherflow.com/swd/rest/observations/station/<id>?token=<token>
                                ▼
                          Tempest cloud  ──▶  latest observation (SI units)
                                │
        ◀──mapped view model────┘  (F/mph/inHg/in or C/m/s/hPa/mm)
```

- The last good reading is cached in the phone's settings storage, so opening the
  watch app is instant and a dropped connection shows the old numbers rather than
  an empty screen.
- A fetch is only made if the cache is older than 60 seconds; the middle button on
  the watch forces one.
- Errors are shown as words on the watch: no station set, token rejected, station
  not found, no reading, no connection.

## Screens on the watch

Swipe or tap `<` / `>` to page through four screens; the dots at the bottom show
which one you are on.

| Page | Big number | Under it |
|---|---|---|
| 1 Temperature | current temp | feels-like + comfort word |
| 2 Wind | average wind | direction (cardinal + degrees), gust |
| 3 Air | humidity | dew point, pressure + trend |
| 4 Sun & rain | UV index | rain today, lightning in the last hour or solar |

![watch mockup](docs/watch-mockup.png)

*(Layout sketch of page 1 — the real app draws these with the watch's own fonts.)*

## Install in one tap on the watch

The package is published as a public GitHub release, so there is nothing to host:

- Release: <https://github.com/josephwmi/tempest-watch/releases/tag/v1.2.0>
- Package: <https://github.com/josephwmi/tempest-watch/releases/download/v1.2.0/tempest-watch-balance2.zab>
- QR: `docs/install-qr.png`

Zepp app › Profile › your Balance 2 › Developer Mode › QR scanner, and scan that
image. Full walkthrough: **[docs/INSTALL.md](docs/INSTALL.md)**.

## Install on the watch

Step-by-step, including the QR code: **[docs/INSTALL.md](docs/INSTALL.md)**.
The short version: turn on developer mode (seven taps on the Zepp logo), put the
`.zab` at a public https URL, `node scripts/make-qr.cjs <that URL>`, then scan
`docs/install-qr.png` with the watch's QR scanner.

## Setup

1. In the Zepp app: **Profile › your watch › App settings › Tempest**.
2. **Station ID** — digits only, from tempestwx.com › Settings › Stations
   (a pasted station URL also works; the app pulls the number out).
3. **Token (optional)** — tempestwx.com › Settings › Data Authorizations › Create
   Token. Not needed for a plain station-id lookup; useful if WeatherFlow asks for
   authenticated access or you later add OAuth.
4. Pick **imperial** or **metric**.
5. Tap **Test connection** — it should come back with your station name and a
   reading.

## Build and install

```bash
npm install
npm test          # 11 tests over the mapping and the side service
npx zeus build    # writes dist/1021234-Tempest-1.0.0-<timestamp>.zab
```

Install on the watch, either way:

- **Zepp app Developer Mode** — Profile › Settings › About, tap the Zepp logo seven
  times; then Profile › your watch › Developer Mode › QR scanner, scanning a QR for
  a `zpkd1://` link to the `.zab` file.
- **Zeus CLI** with the watch bridged: `npx zeus preview` (or `zeus install` for the
  built `.zab`).

Target: **Amazfit Balance 2** — round 480 x 480 AMOLED, Zepp OS 5.0, API level 4.2 (deviceSource 9568512 / 9568513 / 9568515). The build declares only the Balance 2 target and a 480 design width, so `px()` is 1:1 on that screen and Zeus writes a single bundle instead of seven. Minimum API level is 3.0, so other 3.x+ watches still run it if you add their target back.

## Notes and limits

- Tempest's observation endpoint returns SI units only; the station's own unit
  preference comes back separately in `station_units`, so `utils/format.js` does
  the conversion itself.
- The observation endpoint has no sky-condition text ("partly cloudy"), so the
  one-line condition at the top is derived from rain, lightning, solar and UV.
- App ID `1021234` is a placeholder; change it in `app.json` if you register the
  app in the Zepp developer console.
- This is a personal-use client. WeatherFlow's remote data access policy expects
  third-party apps to read the station owner's own data; if you ever publish it
  for other people's stations, use their OAuth flow instead of a personal token.
