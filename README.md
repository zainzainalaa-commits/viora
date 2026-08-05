<div align="center">

# Viora

**A Stremio client for Android, Android TV and the desktop.**

<sub>by zayo0ni</sub>

[![Version](https://img.shields.io/badge/version-1.0.0-orange)](https://github.com/zainzainalaa-commits/viora/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Android](https://github.com/zainzainalaa-commits/viora/actions/workflows/android.yml/badge.svg)](https://github.com/zainzainalaa-commits/viora/actions/workflows/android.yml)

</div>

---

## Install

### Android TV

Open the **Downloader** app and enter this address. It always resolves to the
newest build, so it only has to be typed once:

```
github.com/zainzainalaa-commits/viora/releases/latest/download/Viora-android.apk
```

Allow installation from unknown sources when prompted.

### Android phone

Download the same APK from
[the latest release](https://github.com/zainzainalaa-commits/viora/releases/latest)
and open it.

Requires Android 7.0 (API 24) or newer on an arm64 device.

---

## What it does

A client for the Stremio protocol: it browses catalogs, resolves streams
through add-ons, and plays them. It hosts no content of its own.

| | |
| --- | --- |
| **Catalogs** | Home, Discover, Movies, Shows, Anime, Live TV, Calendar, Library |
| **Add-ons** | Any Stremio add-on, plus **Cinemana** built in as a first-party source |
| **Playback** | mpv on the desktop, HTML5 on Android — picked automatically |
| **Sources** | Torrents via librqbit, direct HTTP, M3U/Xtream playlists with an EPG |
| **Casting** | Chromecast, DLNA/UPnP, Roku |
| **Sync** | Stremio account, Trakt, AniList, MyAnimeList |

---

## Platform support

All three form factors share one codebase and diverge only where the platform
forces it. `src/lib/capabilities.ts` is the single table that decides.

| | Desktop | Android TV | Android phone |
| --- | :---: | :---: | :---: |
| Browsing, catalogs, add-ons | ✅ | ✅ | ✅ |
| Torrent streaming | ✅ | ✅ | ✅ |
| Cinemana | ✅ | ✅ | ✅ |
| Casting | ✅ | ✅ | ✅ |
| mpv engine | ✅ | — | — |
| Transcoding, thumbnails, DVR | ✅ | — | — |
| Multiview, PiP window, HDR overlay | ✅ | — | — |
| System tray, Discord presence | ✅ | — | — |

Android cannot host libmpv inside a WebView, and has blocked executing bundled
binaries from the app data directory since API 29 — which is what rules out
ffmpeg and yt-dlp, and everything built on them. The HTML5 engine covers
playback there instead.

---

## Configuration

Integrations that need a server-side secret ship disabled, because a client app
cannot hold one. `src/lib/brand.ts` is where you point them at infrastructure
you control; [REBRANDING.md](REBRANDING.md) walks through it.

Off until configured: Trakt, AniList and MyAnimeList sign-in, IMDb ratings,
TVDB artwork, the public watch-party relay, the theme gallery, bug reports.
Everything else works out of the box.

---

## Building

```bash
pnpm install
pnpm run build:apk
```

See [BUILDING.md](BUILDING.md) for the flags, the desktop build and the signing
step.

---

## Licence

MIT — see [LICENSE](LICENSE).

Viora is a fork of [Harbor](https://github.com/harborstremio/harbor), whose
copyright notice the licence requires be kept and which is preserved in
`LICENSE`. It is an independent project, not affiliated with or endorsed by
Harbor, Stremio ltd, or Cinemana.

Third-party components carry their own terms: the bundled Noto font under the
SIL Open Font Licence, `rust_cast` under MIT, and — on desktop only — libmpv,
ffmpeg and yt-dlp under theirs.
