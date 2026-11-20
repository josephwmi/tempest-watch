# Installing Tempest on an Amazfit Balance 2

The watch can't open a file directly. It downloads the app from a web address,
and the Zepp app starts that download when you scan a QR code. So there are three
things to get in place: a phone at hand, the `.zab` file at a public HTTPS
address, and developer mode turned on for the watch.

Everything below is the QR route. If you would rather not host a file, step 2 has
the cable-free alternative.

---

## Step 0 — What you need

- The built package: `tempest-watch/dist/tempest-watch-balance2.zab`
  (~290 KB). Rebuild it any time with `npx zeus build`.
- The Zepp app on your phone, paired to the Balance 2.
- A place to put that one file where the watch can fetch it (step 2).

---

## Step 1 — Turn on Developer Mode

1. Open the **Zepp** app on your phone.
2. Go to **Profile** (bottom right).
3. Tap **Settings** (or **About**, depending on your Zepp app version).
4. Tap the **Zepp logo** at the top **seven times** in a row. A message confirms
   developer mode is on. (If you only see About, the same seven taps work there.)
5. Back out to **Profile**, open **your watch** (the Balance 2 in the device list),
   and look for **Developer Mode** in the list. On some Zepp app versions it sits
   under the watch's own **Settings** instead; if the tap sequence leaves you with
   only About, that is the menu to use.

Leave this screen open — it has the QR scanner.

---

## Step 2 — Put the `.zab` somewhere public

The scanner only accepts an `https://` link that anyone can open (no sign-in, no
private folder). Pick whichever is least effort:

**A. A GitHub release (recommended, free, permanent)**

1. Make a repository public — the Zepp app downloads anonymously, so a private
   repo returns a 404 to the watch.
2. Create a release and attach `tempest-watch-balance2.zab` as a release asset.
3. Right-click the asset and copy its link. It looks like
   `https://github.com/<you>/<repo>/releases/download/v1.0/tempest-watch-balance2.zab`.

**B. Any static host** — Netlify Drop, Cloudflare Pages, an S3 bucket with public
read, your own web server. Upload the file, copy its public URL.

**C. No hosting at all — Zeus over Bluetooth**

If the watch is bridged to the developer tools, skip the QR entirely:

```bash
cd tempest-watch
npx zeus preview            # pushes the app over BLE for live testing
# or, for the finished bundle:
npx zeus install dist/tempest-watch-balance2.zab
```

---

## Step 3 — The QR code (already made for you)

This app now has a public home, so you do not need to host anything:

- Repository: <https://github.com/josephwmi/tempest-watch>
- Release asset: https://github.com/josephwmi/tempest-watch/releases/download/v1.2.0/tempest-watch-balance2.zab
- QR code: `docs/install-qr.png` — scan this in step 4. It encodes
  `zpkd1://github.com/josephwmi/tempest-watch/releases/download/v1.2.0/tempest-watch-balance2.zab`

To make a QR for some other build or host:


In the project folder:

```bash
npm install                                   # once, if you have not
node scripts/make-qr.cjs https://YOUR-PUBLIC-LINK/tempest-watch-balance2.zab
```

That writes `docs/install-qr.png` and prints both the link you gave it and the
`zpkd1://` address the QR actually encodes — check those two lines look right
before you scan anything.

If your hosting gives you a link with query parameters or a share token, use the
**direct file URL**, not the "view in browser" page.

---

## Step 4 — Scan it with the watch

1. **Zepp app › Profile › your Balance 2 › Developer Mode**.
2. Tap the **QR scanner** icon at the top right.
3. Point the phone at `docs/install-qr.png` (on screen, or printed — the image is
   640 px, plenty for a phone camera).
4. The app shows the download, then installs. It takes about a minute over
   Bluetooth; keep the phone and watch close and both awake.
5. When it finishes, **Tempest** appears in the watch's app list.

---

## Step 5 — Set your station

1. **Zepp app › Profile › your Balance 2 › App settings › Tempest**.
2. **Station ID** — the digits from tempestwx.com › Settings › Stations. (Pasting
   the whole station URL works too; the app pulls the number out.)
3. **Token** — optional. Create one at tempestwx.com › Settings › Data
   Authorizations if you want the app to identify your account.
4. **Units** — imperial (F, mph, inHg, in) or metric (C, m/s, hPa, mm).
5. Tap **Test connection**. It should answer with your station name and a live
   reading, e.g. *Connected: Backyard — 28°C, 78% RH*.
   - "Station ID was not found" → check the digits.
   - "Could not reach Tempest" → phone's connection, or a token pasted with a
     stray space.
6. Open **Tempest** on the watch. Page 1 shows the temperature; `<` and `>` turn
   to wind, air and sun/rain; the middle button refetches.

---

## When it goes wrong

| What you see | What it means |
|---|---|
| Developer Mode missing from the watch's menu | The seven taps did not register — tap the logo again, slowly, and check for the confirmation message. |
| Scanner says the package is invalid / "only preview apps are supported" | The link points at an HTML page, not the `.zab` file, or the file is private. Open the link in a phone browser first: it should download. |
| Download starts then fails | Host blocks the watch's user agent, or the repo is private. Try a plain static host. |
| App installs but the watch stays on "Fetching…" | The side service hasn't reached Tempest yet — check the station ID in settings, and tap **Test connection** there. |
| Old version still showing | Watch's app list › long-press Tempest › uninstall, then scan again with a bumped version in `app.json`. |

---

## Updating later

Bump `app.version.code` in `app.json`, run `npx zeus build`, upload the new `.zab`
(replacing the asset at the same URL keeps the same QR working), and scan again.
The settings you entered on the phone are kept across updates.
