# Getting Tempest onto the watch without the QR scanner

The QR route fails with **"parse failed"** before anything is downloaded, so no
change to the file's contents has fixed it. These routes skip the scanner entirely.

---

## Route 1 — Bluetooth from this computer (best for testing)

Zeus CLI can push straight to a bridged watch. Nothing is hosted, nothing is scanned.

1. **Bridge the watch.** In the Zepp app: Profile › your Balance 2 › Developer Mode,
   then connect the watch to the developer tools. With the watch on the same desk as
   the computer, run:

   ```bash
   cd tempest-watch
   npx zeus bridge
   ```

   The watch shows a confirmation prompt — accept it. Leave the app on the watch open.

2. **Check it is connected:**

   ```bash
   npx zeus status
   ```

   You want to see a connected device, not "disconnected".

3. **Push the app:**

   ```bash
   npx zeus preview
   ```

   This builds, uploads over Bluetooth, and runs it live on the watch. Logs stream
   back to the terminal, so if the app crashes you will see why.

   For the finished bundle instead of a dev preview:

   ```bash
   npx zeus install --path dist/tempest-watch-balance2.zab --target "Amazfit Balance 2"
   ```

---

## Route 2 — Install from a file on the phone

If Bluetooth is awkward, the Zepp app's developer mode can sometimes install from a
local package rather than a URL. Put `tempest-watch-balance2.zab` on the phone
(download it from the release page, or copy it over USB) and look for an **Install
local package** / **选择本地安装包** option inside Developer Mode.

This option is not present on every Zepp app version. If it is missing, use Route 1.

---

## Route 3 — If you get a Zepp developer account

`npx zeus login` then `npx zeus preview --target <device>` gives the same Bluetooth
push as Route 1 with a cloud fallback. Not required for testing, and it needs an
account you may not want to create.

---

## About the "parse failed" error

I could not reproduce it here — it comes from the Zepp app's own scanner, before any
of the file's contents are used. What I ruled out:

- **The link** — the release asset downloads 125 KB anonymously, byte-identical to the build.
- **The QR image** — regenerated from the real URL; the encoded string is correct.
- **The package header** — appId is in Zepp's public range and the runtime targets
  API 4.0; the values are confirmed inside both device bundles.
- **Two more appIds since** — v1.2.0 and v1.3.0, in case one collides with something
  already on the watch.

What I cannot check from here is your phone and watch: the Zepp app version, whether
the scanner is the app-level one or the watch-level one, and whether that account is
in the programme that permits `zpkd1://` links at all. Route 1 sidesteps all of it.

---

## Which file to use

`tempest-watch/dist/tempest-watch-balance2.zab` — also at
<https://github.com/josephwmi/tempest-watch/releases/download/v1.3.0/tempest-watch-balance2.zab>
