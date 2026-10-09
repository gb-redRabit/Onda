<div align="center">

# Onda

### Your music and video, finally in one place. · Twoja muzyka i wideo wreszcie w jednym miejscu.

<img src="https://img.shields.io/badge/Electron-43.2-47848f?style=flat&logo=electron&logoColor=white" alt="Electron" />
<img src="https://img.shields.io/badge/Vue.js-3.5-4FC08D?style=flat&logo=vue.js&logoColor=white" alt="Vue 3" />
<img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
<img src="https://img.shields.io/badge/Tailwind_CSS-4.3-38B2AC?style=flat&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
<img src="https://img.shields.io/badge/Playwright-1.63-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright" />
<img src="https://img.shields.io/github/v/release/gb-redRabit/Onda?style=flat&label=version&color=605dff" alt="Version" />

**[⬇ Download the latest release](https://github.com/gb-redRabit/Onda/releases)**

[English](#english-version) &nbsp;|&nbsp; [Polski](#wersja-polska)

</div>

---

## English Version

### Onda — a local-first media player and downloader that respects your machine

**Onda** is a fast, private, offline-first desktop media hub for Windows, macOS and Linux, built on **Electron + Vue 3 + TypeScript**. It plays your local audio and video, manages a rich media library, browses your file system, renders subtitles, streams from YouTube and SoundCloud, downloads media with a full post-processing pipeline, and lets you design your own theme — all without an account or telemetry.

> No cloud lock-in. No telemetry. Your files, your machine, your rules.

### Features

**Playback**

- 🎧 Audio engine built on the Web Audio API, decoupled from the UI via an event bus — music keeps playing while you browse.
- 🎚 10-band equalizer with presets, gapless/normalization routing and per-source volume.
- 🌈 8 canvas visualizations (bars, spectrum, wave, radial, rings, circle, particles, none) with crossfade, configurable colors, sensitivity, smoothing, FPS cap and quality levels.
- 🖼 Free-canvas Audio View: place 5 elements (visualizer, cover, track info, progress, controls) anywhere with percentage positioning, layers and opacity. 5 layout presets.
- 🛠 Layout editor with a live mini-preview, 1% grid, drag-and-drop and per-element show/hide.
- ⛶ True Fullscreen API, auto-hiding HUD, cover "pulse" synced to the bass, video-cover loops and CSS marquee for long titles.
- 🎬 Video playback: fullscreen, Picture-in-Picture, 0.2–3.0× speed, filters, skip zones, on-the-fly transcoding of Chromium-unsupported codecs (AC3/DTS → AAC).
- 📱 Media Session API integration (system media keys, lock screen).

**Subtitles**

- 💬 ASS/SRT/VTT/SSA, external and embedded, rendered through **JASSUB** (WASM + Web Worker).
- 🔤 Font extraction from MKV attachments (`mkvextract`), live track switching.

**Media library**

- 📚 Incremental folder scanning (unchanged files are never re-parsed) + a file watcher (`chokidar`) for automatic refresh.
- 🏷 Audio metadata (ID3/FLAC/MP4) via `music-metadata`, covers cached to disk with `sharp`.
- 🗂 Views: track list, video/album grid, folder tree, artists, playlists, images.
- ☑️ Track selection in the Tracks tab (list **and** grid): a checkbox or click selects a single track — Ctrl-click toggles individual tracks, Shift-click selects a range, Esc clears. The bulk bar then offers Play, Add to queue and Add to playlist for the selection (or directly for the one track).
- ✏️ ID3 tag editing, MusicBrainz metadata lookup, favorites and play statistics.

**File explorer**

- 🗃 Drives, folders, tabs, breadcrumbs and 6 virtualized view modes.
- 🧹 Multi-select, copy/move/delete, rename, duplicate finder, properties, terminal, open-with.
- 🖼 ImageViewer lightbox with zoom, rotate, slideshow and a thumbnail strip.

**Online (YouTube / SoundCloud) & downloads**

- 🌐 One `/online` view with a platform switch.
- ▶️ Online streaming without downloading — YouTube through `yt-dlp`, SoundCloud through its internal API with a `yt-dlp` fallback; stream queue with auto-next, LRU URL cache (2 h TTL) and hover prefetch.
- 🛡 Stream hardening: 403 retry with backoff, direct fallback, concurrency cap, warm probes.
- 🎵 SoundCloud client (api-v2, auto `client_id` extraction), sets, artist profiles, MP3 download with ID3 tags and cover art.
- 🔔 Subscriptions — automatic new-video checks (every 6 h), notifications and auto-download.
- ⬇️ Download queue (`yt-dlp` + native HTTP) with progress, speed, ETA, cancel, retry/backoff, covers (thumbnail / frame / video clip), metadata, channel/playlist subfolders and a full post-process (tags, covers, SHA-256, subtitles, library sync).
- 🔄 Queue persistence and crash-safe restore (interrupted → paused, pending → re-queued).

**Picture-in-Picture**

- 📌 Separate always-on-top windows for video and audio, with position/size memory, peek/auto-hide and live theme sync.

**Plugins**

- 🔌 Install from a folder; every plugin starts disabled until you review its permissions, network allowlist and hooks.
- 🧱 Sandboxed Web Worker with resource budgets; consent is bound to the entry file's SHA-256 so changed code needs re-approval.
- 🧩 Rich API: `on` hooks, `query`, `action`, `storage`, `settings`, `fetch` (host allowlist + private-IP block), `notify`, `visual`, `ui`, `log` + custom commands in the command palette and context menus.
- 📦 12 ready-made example plugins installable with one click.

**System & integration**

- 🚀 Autostart, start minimized to tray, close-to-tray.
- 📂 File associations (mp3, flac, ogg, wav, m4a, aac, mp4, mkv, webm, mov, avi) and single-instance file opening.
- ⌨️ Global media shortcuts, tray, command palette (Ctrl+K), auto-updates (`electron-updater`).
- 🌍 PL/EN localization, a follow-the-system theme plus 10 built-in themes (dark / light / midnight / spotify / luxury / cyberpunk / aqua / black / lemonade / abyss) and a live-preview Theme Creator.

**Themes & appearance**

- 🎨 29 semantic theme variables (daisyUI-compatible), transparent/acrylic window with adjustable opacity.
- 🧬 Radius presets (`rounded-box` / `rounded-field` / `rounded-selector`) driving the whole UI, depth/noise effects.

**Settings**

- ⚙️ 9 groups in 6 sections, a settings search bar, JSON export/import with `safeStorage`-encrypted secrets, per-platform quality/proxy, cache and download limits, log level and telemetry off.

### Tech Stack

| Layer          | Technology                                                  |
| -------------- | ----------------------------------------------------------- |
| Runtime        | Electron 44 (sandbox, contextIsolation, no nodeIntegration) |
| UI             | Vue 3.5 (Composition API, `<script setup>`)                 |
| Language       | TypeScript 5.9 (strict)                                     |
| Build          | electron-vite 5 + Vite 7.3                                  |
| Styling        | Tailwind CSS 4.3 + daisyUI theme values                     |
| State          | Pinia 4                                                     |
| Routing        | vue-router 5 (hash history, lazy loading)                   |
| i18n           | vue-i18n 11 (PL/EN, parity enforced by tests)               |
| Metadata       | music-metadata, node-id3                                    |
| Virtualization | @tanstack/vue-virtual                                       |
| Images         | sharp (libvips)                                             |
| Subtitles      | jassub (WASM)                                               |
| File watching  | chokidar                                                    |
| Testing        | Vitest 5 + jsdom 30, Playwright 1.63 (E2E)                  |
| Packaging      | electron-builder (NSIS / DMG / AppImage / deb / rpm)        |

### External dependencies (not bundled)

The installer ships **only Onda and Electron** — no third-party binaries. FFmpeg/FFprobe and `yt-dlp` are fetched on demand into the user profile and verified against a pinned SHA-256 (`binaries.json`); if a tool already exists on `PATH`, Onda uses it as-is. Status and installation live in **Settings → Dependencies** (and in the first-run wizard):

- **FFmpeg / FFprobe** — on-the-fly audio transcoding, frame extraction, thumbnails.
- **yt-dlp** — downloading from YouTube and SoundCloud (API fallback).
- **MKVToolNix (`mkvextract`)** — extracting embedded MKV fonts.

### Project Structure

```text
Onda/
├─ src/
│  ├─ main/                 Electron main process (Windows, tray, lifecycle)
│  │  ├─ index.ts           bootstrap, single-instance, splash, boot timeline
│  │  ├─ media-server.ts    local HTTP media server (token, roots, Range)
│  │  ├─ ipc/               ~25 typed IPC handler modules (contract-driven)
│  │  ├─ downloads/         yt-dlp + HTTP download pipeline (queue, retry, post-process)
│  │  ├─ utils/             exec, sharp, validation, safe broadcast
│  │  └─ …                  updater, tray, PiP managers, auth, watchers
│  ├─ preload/              contextBridge + generated allowlists (window.api)
│  ├─ renderer/src/
│  │  ├─ views/             Home, Library, Explorer, Online, Downloads, Player, Audio, Settings, Sources
│  │  ├─ modules/           ModuleManager + Player/Explorer/Library/YouTube/Home/Settings
│  │  ├─ stores/            Pinia stores (player, library, settings, ui, online, sources …)
│  │  ├─ composables/       ~76 reusable composables
│  │  ├─ components/        layout, library, online, settings, audio, explorer, sources, wizard …
│  │  ├─ utils/             ~105 helpers (formatters, caches, media, search …)
│  │  └─ locales/           en.ts / pl.ts
│  └─ shared/               types, constants, IPC contract, logger, built-in themes
├─ e2e/                     Playwright + Electron end-to-end specs
├─ scripts/                 IPC codegen, FFmpeg fetch, CI guards
├─ resources/               splash, icons, example plugins
└─ docs/                    architecture & contributor rules
```

### Quick Start

Requirements: **Node.js ≥ 22.12** and npm ≥ 11. Packaged macOS builds require **macOS 13 (Ventura)** or later (Electron 44).

```bash
npm install
npm run dev
```

Quality gates:

```bash
npm test           # 1667 unit tests (Vitest)
npm run typecheck  # tsc (main/preload) + vue-tsc (renderer)
npm run lint       # ESLint
npm run e2e        # Playwright + Electron (run `npm run build` first)
```

Production builds:

```bash
npm run build        # typecheck + build (main / preload / renderer)
npm run build:win    # NSIS installer (Windows)
npm run build:mac    # DMG (macOS)
npm run build:linux  # AppImage / deb / rpm (Linux)
```

> **Signing:** CI-published builds are unsigned (Windows SmartScreen and macOS Gatekeeper will warn). Signing requires an Authenticode certificate and an Apple Developer ID — see `electron-builder.yml`. Until then, keep `verifyUpdateCodeSignature: false` so `electron-updater` accepts its own unsigned updates.

### Performance & Optimization

Onda is built to stay smooth on large libraries and slow disks.

| Optimization                     | What it delivers                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Virtualization everywhere**    | Every long list/grid (library, downloads, explorer, queue, sources) renders only visible rows via `@tanstack/vue-virtual`.                                                                                                  |
| **Lazy loading + idle prefetch** | All routes and heavy panels are async-loaded; core views are prefetched during browser idle time.                                                                                                                           |
| **Cheap reactivity**             | Large collections use `shallowRef`/`triggerRef`; search uses a prebuilt, normalized index computed once per collection change — not per keystroke.                                                                          |
| **Debounce & throttle**          | Search 200 ms, settings persistence 300 ms (serialized revision writer), download progress 200 ms, file watcher 2 s.                                                                                                        |
| **Scale-ready scanning**         | Incremental scan (reuses unchanged files by size+mtime), 16-way bounded concurrency, interleaved 50-file chunks and a 50 000-file budget that stops the walk early.                                                         |
| **Byte-range streaming**         | A local HTTP media server serves audio/video with `Range` (incl. suffix) requests; remote streams are proxied with bounded retries.                                                                                         |
| **Layered caches**               | Cover, thumbnail, stream-URL and remote-image caches are memory+disk layered, each with an explicit cap and TTL — no unbounded growth.                                                                                      |
| **Work off the main thread**     | JASSUB subtitles run in a Web Worker (WASM); plugins are sandboxed in workers with hard CPU/message budgets.                                                                                                                |
| **Resource safety**              | `AbortController` for cancelling scans/downloads, pinned DNS to prevent SSRF, download concurrency capped at 8, atomic queue persistence, spawn semaphore for subtitle extraction, LRU eviction for cover/thumbnail caches. |
| **Race-free selection & search** | Request-id/token guards make stale async responses (search pagination, cover loads, module switches, library scans) no-ops.                                                                                                 |
| **Quality gates**                | 1667 unit tests + 56 Playwright E2E tests (35 specs) + lint + typecheck + IPC codegen check run on every change.                                                                                                            |

### Security

Onda treats the renderer as untrusted and enforces its boundaries in the main process:

- **Process isolation** — `sandbox`, `contextIsolation`, `nodeIntegration: false`, `webSecurity: true`; a single window factory applies them everywhere.
- **IPC contract** — every channel is declared in one source of truth (`src/shared/ipc/contract.ts`), allowlisted in the preload, and verified by a compile-time guard plus tests (invoke ↔ `ipcMain.handle`, send ↔ `ipcMain.on`). The `/metrics` of the codegen: **206 invoke / 15 send / 45 receive**.
- **SSRF defense** — outbound fetches resolve through a pinned-DNS guard that blocks loopback/private/metadata ranges and validates **every** redirect hop (media, sources, remote images, SoundCloud artwork).
- **Secrets never reach the renderer** — API keys are encrypted at rest via `safeStorage`; `settings:get` returns only a masked preview, and writes merge by id so the stored secret survives round-trips.
- **Filesystem policy** — destructive and mutating handlers refuse volume roots, system directories and sensitive locations; the media server authorizes with a timing-safe token, origin checks and realpath-contained roots.
- **Navigation & permissions** — a navigation guard, an external-link policy, deny-by-default session permissions, and log redaction for tokens/headers/passwords.
- **Plugins** — sandboxed Web Workers with hard resource budgets, a host-allowlist network bridge and consent bound to the entry file's SHA-256.

### Contributing

Issues and pull requests are welcome. Before committing, run `npm run build` and `npm test`. We follow **Conventional Commits**; releases are managed by **release-please** (`feat` → minor, `fix` → patch). Never run `npm version` on `main` — `npm run version:check` enforces this. See [`RELEASE.md`](./RELEASE.md).

By contributing, you agree that your contribution is licensed under the PolyForm Noncommercial License 1.0.0.

### License

[PolyForm Noncommercial License 1.0.0](./LICENSE)

Onda is **source-available**, not open source: you may use, modify and share it freely for any **noncommercial** purpose — personal use, study, hobby projects, education, charities, research and government institutions. **Commercial use requires a separate license**; contact the maintainers. See [`LICENSE`](./LICENSE) for the full terms.

© 2026 Onda Contributors.

---

## Wersja polska

### Onda — lokalny odtwarzacz i pobierak multimediów, który szanuje Twój komputer

**Onda** to szybki, prywatny, działający offline desktopowy hub multimediów dla Windows, macOS i Linux, zbudowany na **Electron + Vue 3 + TypeScript**. Odtwarza lokalne audio i wideo, zarządza bogatą biblioteką, eksploruje system plików, renderuje napisy, streamuje z YouTube i SoundCloud, pobiera media z pełnym post-processingiem i pozwala zaprojektować własny motyw — bez konta i bez telemetrii.

> Bez chmury i Vendor lock-in. Bez telemetrii. Twoje pliki, Twój komputer, Twoje zasady.

### Funkcje

**Odtwarzanie**

- 🎧 Silnik audio oparty o Web Audio API, oddzielony od UI przez szynę zdarzeń — muzyka gra dalej, gdy przeglądasz aplikację.
- 🎚 10-pasmowy equalizer z presetami, routingiem gapless/normalizacją i głośnością per źródło.
- 🌈 8 wizualizacji na canvasie (bars, spectrum, wave, radial, rings, circle, particles, none) z crossfade, kolorami, czułością, wygładzaniem, limitem FPS i jakością.
- 🖼 Widok Audio (free canvas): 5 elementów (wizualizacja, okładka, info, progress, kontrolki) w dowolnym miejscu, pozycjonowanie procentowe, warstwy i przezroczystość. 5 presetów.
- 🛠 Edytor layoutu z mini-podglądem, siatką 1%, drag-and-drop i show/hide per element.
- ⛶ Prawdziwy Fullscreen API, auto-ukrywany HUD, „puls" okładki zsynchronizowany z basem, pętle okładek wideo i marquee długich tytułów.
- 🎬 Odtwarzanie wideo: pełny ekran, Picture-in-Picture, prędkość 0.2–3.0×, filtry, strefy pomijania, transkodowanie w locie kodeków niewspieranych przez Chromium (AC3/DTS → AAC).
- 📱 Integracja z Media Session API (multimedialne klawisze systemowe, ekran blokady).

**Napisy**

- 💬 ASS/SRT/VTT/SSA, zewnętrzne i osadzone, renderowane przez **JASSUB** (WASM + Web Worker).
- 🔤 Ekstrakcja czcionek z załączników MKV (`mkvextract`), przełączanie ścieżek w locie.

**Biblioteka multimediów**

- 📚 Skanowanie przyrostowe folderów (niezmienione pliki nie są parsowane ponownie) + watcher (`chokidar`) z automatycznym odświeżaniem.
- 🏷 Metadane audio (ID3/FLAC/MP4) przez `music-metadata`, okładki cache'owane na dysku (`sharp`).
- 🗂 Widoki: lista utworów, siatka wideo/albumów, drzewo folderów, artyści, playlisty, obrazy.
- ☑️ Zaznaczanie utworów w zakładce Utwory (lista **i** siatka): checkbox lub klik zaznacza pojedynczy utwór — Ctrl+klik przełącza pojedyncze utwory, Shift+klik zaznacza zakres, Esc czyści. Pasek zbiorczy daje wtedy Odtwórz, Dodaj do kolejki i Dodaj do playlisty dla zaznaczenia (albo wprost dla tego jednego utworu).
- ✏️ Edycja tagów ID3, uzupełnianie metadanych z MusicBrainz, ulubione i statystyki odtworzeń.

**Eksplorator plików**

- 🗃 Dyski, foldery, zakładki, breadcrumb i 6 zwirtualizowanych trybów widoku.
- 🧹 Zaznaczanie wielokrotne, kopiuj/przenieś/usuń, zmiana nazwy, wyszukiwanie duplikatów, właściwości, terminal, otwieranie w aplikacji domyślnej.
- 🖼 Podgląd obrazów (lightbox) z zoomem, rotacją, pokazem slajdów i paskiem miniatur.

**Online (YouTube / SoundCloud) i pobieranie**

- 🌐 Jeden widok `/online` z przełącznikiem platform.
- ▶️ Streaming online bez pobierania — YouTube przez `yt-dlp`, SoundCloud przez wewnętrzne API z fallbackiem `yt-dlp`; kolejka streamów z auto-next, cache URL-i (LRU, TTL 2 h) i prefetch na hover.
- 🛡 Hardening streamów: retry 403 z backoffem, fallback direct, cap współbieżności, warm probe.
- 🎵 Klient SoundCloud (api-v2, automatyczna ekstrakcja `client_id`), sety, profile artystów, pobieranie MP3 z tagami ID3 i okładką.
- 🔔 Subskrypcje — automatyczne sprawdzanie nowych wideo (co 6 h), powiadomienia i auto-download.
- ⬇️ Kolejka pobierania (`yt-dlp` + natywny HTTP) z progresem, prędkością, ETA, anulowaniem, retry/backoffem, okładkami (miniatura / klatka / klip), metadanymi, podfolderami kanału/playlisty i pełnym post-processingiem (tagi, okładki, SHA-256, napisy, sync z biblioteką).
- 🔄 Persystencja kolejki i bezpieczne wznowienie po restarcie (przerwane → pauza, oczekujące → ponownie w kolejce).

**Picture-in-Picture**

- 📌 Osobne okna always-on-top dla wideo i audio, z pamięcią pozycji/rozmiaru, peek/auto-hide i synchronizacją motywu na żywo.

**Wtyczki**

- 🔌 Instalacja z folderu; każda wtyczka startuje wyłączona, dopóki nie przejrzysz jej uprawnień, allowlisty sieciowej i hooków.
- 🧱 Sandbox w Web Workerze z budżetami zasobów; zgoda wiązana z SHA-256 pliku wejściowego, więc zmiana kodu wymaga ponownej akceptacji.
- 🧩 Bogate API: hooki `on`, `query`, `action`, `storage`, `settings`, `fetch` (allowlista hostów + blokada prywatnych IP), `notify`, `visual`, `ui`, `log` oraz własne komendy w palecie poleceń i menu kontekstowym.
- 📦 12 gotowych wtyczek-przykładów instalowanych jednym kliknięciem.

**System i integracja**

- 🚀 Autostart, start zminimalizowany do trayu, ukrywanie do trayu po zamknięciu.
- 📂 Skojarzenia plików (mp3, flac, ogg, wav, m4a, aac, mp4, mkv, webm, mov, avi) i single-instance (otwieranie plików z systemu trafia do istniejącej instancji).
- ⌨️ Globalne skróty multimedialne, tray, paleta poleceń (Ctrl+K), aktualizacje (`electron-updater`).
- 🌍 Lokalizacja PL/EN, motyw „systemowy" (podąża za ustawieniem systemu) plus 10 motywów wbudowanych (dark / light / midnight / spotify / luxury / cyberpunk / aqua / black / lemonade / abyss) i Kreator Motywów z live-preview.

**Motywy i wygląd**

- 🎨 29 semantycznych zmiennych motywu (zgodnych z daisyUI), przezroczyste okno akrylowe z regulacją krycia.
- 🧬 Presety radiusów (`rounded-box` / `rounded-field` / `rounded-selector`) sterujące całym UI, efekty depth/noise.

**Ustawienia**

- ⚙️ 9 grup w 6 sekcjach, wyszukiwarka ustawień, eksport/import JSON z sekretami szyfrowanymi `safeStorage`, jakość/proxy per platforma, limity cache i pobierania, poziom logów i telemetria wyłączona.

### Stos technologiczny

| Warstwa        | Technologia                                                   |
| -------------- | ------------------------------------------------------------- |
| Runtime        | Electron 44 (sandbox, contextIsolation, brak nodeIntegration) |
| UI             | Vue 3.5 (Composition API, `<script setup>`)                   |
| Język          | TypeScript 5.9 (strict)                                       |
| Build          | electron-vite 5 + Vite 7.3                                    |
| Style          | Tailwind CSS 4.3 + wartości motywu daisyUI                    |
| Stan           | Pinia 4                                                       |
| Routing        | vue-router 5 (hash history, lazy loading)                     |
| i18n           | vue-i18n 11 (PL/EN, parytet wymuszany testami)                |
| Metadane       | music-metadata, node-id3                                      |
| Wirtualizacja  | @tanstack/vue-virtual                                         |
| Obrazy         | sharp (libvips)                                               |
| Napisy         | jassub (WASM)                                                 |
| Watcher plików | chokidar                                                      |
| Testy          | Vitest 5 + jsdom 30, Playwright 1.63 (E2E)                    |
| Pakiety        | electron-builder (NSIS / DMG / AppImage / deb / rpm)          |

### Zależności zewnętrzne (nie-NPM)

Instalator zawiera **wyłącznie Onda i Electron** — żadnych binarek stron trzecich. FFmpeg/FFprobe oraz `yt-dlp` są pobierane na żądanie do profilu użytkownika i weryfikowane przypiętym SHA-256 (`binaries.json`); jeśli narzędzie jest już w `PATH`, Onda użyje go bez pobierania. Status i instalacja: **Ustawienia → Zależności** (oraz kreator pierwszego uruchomienia):

- **FFmpeg / FFprobe** — transkodowanie audio w locie, ekstrakcja klatek, miniatury.
- **yt-dlp** — pobieranie z YouTube i SoundCloud (fallback dla API).
- **MKVToolNix (`mkvextract`)** — ekstrakcja osadzonych czcionek z MKV.

### Struktura projektu

```text
Onda/
├─ src/
│  ├─ main/                 proces główny Electrona (okna, tray, cykl życia)
│  │  ├─ index.ts           bootstrap, single-instance, splash, boot timeline
│  │  ├─ media-server.ts    lokalny serwer HTTP mediów (token, rooty, Range)
│  │  ├─ ipc/               ~25 typowanych modułów IPC (zgodnych z kontraktem)
│  │  ├─ downloads/         pipeline pobierania yt-dlp + HTTP (kolejka, retry, post-process)
│  │  ├─ utils/             exec, sharp, walidacja, bezpieczny broadcast
│  │  └─ …                  updater, tray, menedżery PiP, auth, watchery
│  ├─ preload/              contextBridge + generowane allowlisty (window.api)
│  ├─ renderer/src/
│  │  ├─ views/             Home, Library, Explorer, Online, Downloads, Player, Audio, Settings, Sources
│  │  ├─ modules/           ModuleManager + Player/Explorer/Library/YouTube/Home/Settings
│  │  ├─ stores/            store'y Pinia (player, library, settings, ui, online, sources …)
│  │  ├─ composables/       ~76 reużywalnych composables
│  │  ├─ components/        layout, library, online, settings, audio, explorer, sources, wizard …
│  │  ├─ utils/             ~105 helperów (formattery, cache, media, wyszukiwanie …)
│  │  └─ locales/           en.ts / pl.ts
│  └─ shared/               typy, stałe, kontrakt IPC, logger, motywy wbudowane
├─ e2e/                     specyfikacje Playwright + Electron
├─ scripts/                 codegen IPC, pobieranie FFmpeg, guardy CI
├─ resources/               splash, ikony, przykładowe wtyczki
└─ docs/                    architektura i reguły dla kontrybutorów
```

### Szybki start

Wymagania: **Node.js ≥ 22.12** i npm ≥ 11. Spakowane buildy dla macOS wymagają **macOS 13 (Ventura)** lub nowszego (Electron 44).

```bash
npm install
npm run dev
```

Bramki jakości:

```bash
npm test           # 1667 testów jednostkowych (Vitest)
npm run typecheck  # tsc (main/preload) + vue-tsc (renderer)
npm run lint       # ESLint
npm run e2e        # Playwright + Electron (najpierw `npm run build`)
```

Buildy produkcyjne:

```bash
npm run build        # typecheck + build (main / preload / renderer)
npm run build:win    # instalator NSIS (Windows)
npm run build:mac    # DMG (macOS)
npm run build:linux  # AppImage / deb / rpm (Linux)
```

> **Podpisywanie:** buildy publikowane z CI są niespodpisane (Windows SmartScreen i macOS Gatekeeper ostrzegą). Podpisywanie wymaga certyfikatu Authenticode i Apple Developer ID — patrz `electron-builder.yml`. Do tego czasu trzymaj `verifyUpdateCodeSignature: false`, aby `electron-updater` przyjmował własne niespodpisane aktualizacje.

### Wydajność i optymalizacja

Onda jest zaprojektowana tak, by pozostać płynna przy dużych bibliotekach i wolnych dyskach.

| Optymalizacja                                    | Efekt                                                                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wirtualizacja wszędzie**                       | Każda długa lista/siatka (biblioteka, pobierania, eksplorator, kolejka, źródła) renderuje tylko widoczne wiersze (`@tanstack/vue-virtual`).                                                                          |
| **Lazy loading + prefetch na idle**              | Wszystkie trasy i ciężkie panele ładowane asynchronicznie; kluczowe widoki prefetchowane w czasie bezczynności.                                                                                                      |
| **Tania reaktywność**                            | Duże kolekcje na `shallowRef`/`triggerRef`; wyszukiwanie korzysta z gotowego indeksu budowanego raz na zmianę kolekcji — nie przy każdym klawiszu.                                                                   |
| **Debounce i throttle**                          | Wyszukiwarka 200 ms, zapis ustawień 300 ms (serializowany writer), postęp pobierania 200 ms, watcher 2 s.                                                                                                            |
| **Skanowanie gotowe na skalę**                   | Skan przyrostowy (wykorzystuje niezmienione pliki po rozmiarze+mtime), 16-wątkowa ograniczona współbieżność, przeplatane porcje po 50 i budżet 50 000 plików zatrzymujący przejście.                                 |
| **Streaming zakresowy**                          | Lokalny serwer HTTP serwuje audio/wideo z nagłówkami `Range` (w tym suffix); zdalne strumienie przez proxy z ograniczonym backoffem.                                                                                 |
| **Warstwowe cache**                              | Cache okładek, miniatur, URL-i streamów i zdalnych obrazów są warstwowe (pamięć+dysk), każdy z jawnym limitem i TTL — bez niekontrolowanego wzrostu.                                                                 |
| **Praca poza wątkiem głównym**                   | Napisy JASSUB w Web Workerze (WASM); wtyczki w sandboxie workera z twardymi budżetami.                                                                                                                               |
| **Bezpieczeństwo zasobów**                       | `AbortController` do anulowania skanów/pobrań, przypięty DNS przeciw SSRF, limit współbieżności pobrań 8, atomowa persystencja kolejki, semafor spawnu przy ekstrakcji napisów, ewiction LRU cache okładek/miniatur. |
| **Wolne od wyścigów zaznaczanie i wyszukiwanie** | Tokeny/request-id sprawiają, że przedawnione odpowiedzi (paginacja wyszukiwania, ładowanie okładek, przełączenia modułów, skany biblioteki) są no-opami.                                                             |
| **Bramki jakości**                               | 1667 testów jednostkowych + 56 testów E2E (35 specyfikacji) + lint + typecheck + check codegenu IPC przy każdej zmianie.                                                                                             |

### Bezpieczeństwo

Onda traktuje renderer jako niezaufany i egzekwuje granice w procesie głównym:

- **Izolacja procesu** — `sandbox`, `contextIsolation`, `nodeIntegration: false`, `webSecurity: true`; jedna fabryka okien stosuje to wszędzie.
- **Kontrakt IPC** — każdy kanał zadeklarowany w jednym źródle prawdy (`src/shared/ipc/contract.ts`), na allowliście preloadu i pilnowany strażnikiem czasu kompilacji oraz testami (invoke ↔ `ipcMain.handle`, send ↔ `ipcMain.on`). Stan codegenu: **206 invoke / 15 send / 45 receive**.
- **Obrona przed SSRF** — wychodzące żądania przechodzą przez guard z przypiętym DNS, który blokuje zakresy loopback/prywatne/metadanych i waliduje **każdy** hop przekierowania (media, źródła, zdalne obrazy, okładki SoundCloud).
- **Sekrety nie trafiają do renderera** — klucze API są szyfrowane w spoczynku przez `safeStorage`; `settings:get` zwraca tylko zamaskowany podgląd, a zapis scala po `id`, więc zapisany sekret przetrwa rundy zapisu.
- **Polityka systemu plików** — destrukcyjne i mutujące handlery odrzucają korzenie wolumenów, katalogi systemowe i lokalizacje wrażliwe; serwer mediów autoryzuje timing-safe tokenem, sprawdzaniem originu i realpath wewnątrz rootów.
- **Nawigacja i uprawnienia** — strażnik nawigacji, polityka otwierania linków, deny-by-default dla sesji i redakcja tokenów/nagłówków/haseł w logach.
- **Wtyczki** — sandbox Web Worker z twardymi budżetami, most sieciowy z allowlistą hostów i zgoda związana z SHA-256 pliku wejściowego.

### Współpraca

Zgłoszenia i pull requesty mile widziane. Przed commitem uruchom `npm run build` i `npm test`. Stosujemy **Conventional Commits**, a wydaniami zarządza **release-please** (`feat` → minor, `fix` → patch). Nie uruchamiaj `npm version` na `main` — pilnuje tego `npm run version:check`. Szczegóły: [`RELEASE.md`](./RELEASE.md).

Wysyłając zmianę, zgadzasz się na licencjonowanie swojego wkładu na warunkach PolyForm Noncommercial License 1.0.0.

### Licencja

[PolyForm Noncommercial License 1.0.0](./LICENSE)

Onda jest **source-available**, a nie open source: możesz jej używać, modyfikować i udostępniać bezpłatnie w dowolnym celu **niekomercyjnym** — użytek prywatny, nauka, projekty hobbystyczne, edukacja, organizacje charytatywne, badania i instytucje publiczne. **Użytek komercyjny wymaga osobnej licencji**; skontaktuj się z opiekunami projektu. Pełna treść: [`LICENSE`](./LICENSE).

© 2026 Onda Contributors.

---

<div align="center">

**[⬆ English](#english-version) · [⬆ Polski](#wersja-polska)**

Made with care for people who own their media. · Zrobione z myślą o ludziach, którzy są właścicielami swoich mediów.

</div>
