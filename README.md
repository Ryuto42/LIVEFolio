# LIVEFolio

[日本語](README.ja.md)

LIVEFolio is an app for recording the live concerts you attend and looking back on them. It runs on iOS, Android, and the web (PWA). All data stays on your device.

## Features

- **Record lives**: one-man shows, festivals, and multi-artist shows (taiban), with photos, venues, and setlists
- **Home**: countdown to your next live, your all-time totals, recent lives, and a calendar shortcut
- **Stats**: rankings for lives, artists, venues, and songs, filterable by year, with rank changes from the previous year
- **Calendar**: a yearly heatmap of the days you went to lives, plus monthly and weekday charts
- **Replay**: a story-style look back at each year
- **Artist pages**: number of lives, first live, lives per year, and the songs you heard most
- **Search** across artists, live titles, and venues
- **Artwork**: artist photos and song covers are fetched automatically (Spotify / iTunes)
- **Backup**: export to JSON and import from JSON or CSV

## Install

### Web (PWA)

Open the published site (GitHub Pages: `https://<user>.github.io/LIVEFolio/`) in a browser. To use it like an app, choose "Add to Home Screen" in Safari on iPhone, or "Install app" in Chrome.

### Android

Download the APK from [Releases](../../releases) and install it. You may need to allow installing apps from unknown sources.

### iOS

There is no prebuilt iOS version. Build it from source with Xcode (see below). A free Apple account lets you run it on your own iPhone for 7 days at a time.

## Build from source

Requirements: Node.js 20.19 or later (22 recommended). For the native apps you also need Android Studio (JDK 21) and/or Xcode 16 or later.

```bash
git clone https://github.com/Ryuto42/LIVEFolio.git
cd LIVEFolio
npm ci
```

| Purpose | Command |
|---|---|
| Develop in the browser | `npm run dev` → http://localhost:5173 |
| Build the web app | `npm run build` (output in `dist/`) |
| Preview the production build (PWA works here) | `npm run preview` |
| Sync the web build to the native projects | `npm run build && npx cap sync` |
| Open in Android Studio / Xcode | `npx cap open android` / `npx cap open ios` |

If you publish your own build, change the app ID (`jp.ryuto.livefolio`) in `capacitor.config.json`, `android/app/build.gradle`, and the Xcode project, and set your own signing team in Xcode.

### Hosting the web app

`dist/` is a static single-page app. Configure your host to serve `index.html` for every path.

- **GitHub Pages**: enable *Settings → Pages → Source: GitHub Actions*. Each push to `main` deploys via `.github/workflows/pages.yml`. When serving from a custom domain at the root, set the repository variable `PAGES_BASE` to `/`.
- **Other hosts**: to serve under a sub-path, build with `npx vite build --base=/your-path/`.

### Releasing the Android APK

Pushing a tag such as `v1.0.0` builds an APK with `.github/workflows/android-release.yml` and attaches it to a GitHub Release. To sign it with your release key, add these repository secrets. Without them, a debug-signed APK is built.

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | your keystore file, base64-encoded (`base64 -i release.keystore`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |

## Spotify integration (optional)

Without it, song covers come from iTunes, and artist photos are not fetched. To enable it:

1. Create an app on the [Spotify for Developers](https://developer.spotify.com/dashboard) dashboard.
2. Enter its Client ID and Client Secret in **Settings → Spotify** in the app.

The keys are stored only on your device (`localStorage`) and are sent only to Spotify. They are used with the Client Credentials flow, so no Spotify account login is needed. Do not use keys that you share with other services, because anyone with access to the device or browser profile can read them.

## Privacy

- Live records, photos, and settings are stored only on your device (IndexedDB / localStorage). There is no server or account.
- To fetch artwork, the app sends artist names and song titles to Spotify (`api.spotify.com`, `open.spotify.com`) and Apple (`itunes.apple.com`). Images are loaded from their CDNs.

## Project structure

```
src/
  main.js          routes and tab bar
  router.js        page stack, transitions, swipe back
  db.js            IndexedDB (Dexie) and change notifications
  domain/stats.js  aggregation (rankings, calendar, etc.)
  pages/           screens
  ui/              shared components, motion, icons, haptics
  trackArt.js      song artwork lookup (Spotify / iTunes)
  sync.js          artist image sync
public/            PWA manifest, service worker, icons
android/ ios/      Capacitor native projects
```

## Contributing

Issues and pull requests are welcome. Before opening a pull request, check that `npm run build` succeeds and that the screens you changed work at mobile width (375px) in `npm run dev`.

To report a security issue, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
