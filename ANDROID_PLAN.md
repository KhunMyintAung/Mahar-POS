# Android app (TWA) — plan

The Android app is a **Trusted Web Activity**: a small APK that opens app.maharpos.shop in
Chrome, full screen, with no address bar. Every screen and flow is the PWA's own, and a deploy
updates the app at once. Nothing is rewritten.

Why not a Flutter WebView: the app signs in with Google and prints slips with
`window.print()`. Google blocks its sign-in inside a WebView, and a WebView has no print. TWA
runs in Chrome, so both work as they do in the browser. It is also ~1–2 MB, not ~15–20 MB.

Status: **planned, not started.** Nothing is installed or changed yet.

## 1. Tools (once, on the build PC — about 700 MB)

| What | From | Size |
|---|---|---|
| `@bubblewrap/cli` (`npm i -g @bubblewrap/cli`) | npmjs.com | ~30 MB |
| JDK 17 (Bubblewrap offers to download it) | adoptium.net | ~190 MB |
| Android SDK command-line tools (same) | dl.google.com | ~150 MB |
| Android build-tools + platform | dl.google.com | ~300 MB |

These go under `C:\Users\Admin\.bubblewrap`. Android Studio is not needed.

## 2. Project

- Folder: `android/` in this repo. Commit `twa-manifest.json` and the generated Gradle project.
- **Never commit the keystore**: add `android/*.keystore` and `android/*.jks` to `.gitignore`.
- Created with `bubblewrap init --manifest https://app.maharpos.shop/manifest.webmanifest`. It
  reads the name, icons and colours from the PWA manifest. Answers to give it:
  - Package name: `shop.maharpos.app`. This cannot change after the first install or upload.
  - App name / short name: Mahar Mini POS
  - Start URL: `/full-app` (the manifest's own)
  - Theme `#1d4ed8`, background `#f6f7f9`, display standalone, orientation any
  - Icons: `/mahar-icon-512.png` and maskable `/mahar-icon-maskable-512.png`

## 3. Signing key (the owner does this, not Claude)

- `bubblewrap init` creates `android/android.keystore` and asks for two passwords.
- Keep the keystore file and both passwords safe and backed up, somewhere other than this PC.
  Without them, an installed app can never be updated; it has to be uninstalled and
  installed again.
- Then print the key's SHA-256 fingerprint:
  `keytool -list -v -keystore android/android.keystore -alias android`

## 4. Digital Asset Links (on the server — Claude can do this)

Without this file, Chrome shows an address bar at the top of the app.

- Add `public/.well-known/assetlinks.json`:
  ```json
  [{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "shop.maharpos.app",
      "sha256_cert_fingerprints": ["<SHA-256 from step 3>"]
    }
  }]
  ```
- If the app goes on Google Play, also add Play's app-signing fingerprint (Play Console → Setup →
  App signing) to that list.
- Deploy, then check that `https://app.maharpos.shop/.well-known/assetlinks.json` returns the
  JSON with `content-type: application/json`. The proxy does not touch `/.well-known`, and
  nginx/Cloudflare must not redirect it.

## 5. Build

- `cd android && bubblewrap build`
- Output:
  - `app-release-signed.apk`: install onto shop phones (allow "install unknown apps").
  - `app-release-bundle.aab`: the file Google Play takes.
- Test on a phone:
  - opens with no address bar;
  - Google sign-in works;
  - a slip prints;
  - the camera barcode scan works;
  - Telegram links open.

## 6. Google Play (only if wanted)

- A Play Console account, created by the owner ($25, one time).
- The privacy policy (`/privacy`) and account deletion (`/account-deletion`) pages already exist.
- Decide on the **Play edition**. `APP_EDITION=PLAY` exists so that a store build does not ask
  for donations. But it is set for the whole server, so the web app would change too. Hiding
  donations only inside the app needs a small change first, e.g. the TWA starting at `/play-app`
  and setting a cookie.

## 7. Later updates

- Screens and features: deploy the web app as usual; the APK does not change.
- Rebuild the APK only for a new icon, name or colour, or a new Android target required by
  Play. Before a rebuild, raise `appVersionCode` in `twa-manifest.json`.
