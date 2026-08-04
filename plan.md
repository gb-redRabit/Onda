# Onda — Plan rozwoju i napraw (v3.0)

> Dokument opisuje **całą aplikację** (architektura, modularność, struktura), **zależności zewnętrzne** oraz **szczegółowe plan napraw** (jakość kodu, wydajność, redukcja duplikacji, UI ustawień i w pełni wieloplatformowa obsługa zależności).
>
> Stan bazowy: typecheck 0, lint 0, **190/190 testów**, build OK. Data: 2026-08-03.

---

## Spis treści

1. [Opis aplikacji](#1-opis-aplikacji)
2. [Architektura i modularność](#2-architektura-i-modularność)
3. [Struktura repozytorium](#3-struktura-repozytorium)
4. [Zależności zewnętrzne (nie-NPM)](#4-zależności-zewnętrzne-nie-npm)
5. [Wspólne źródła prawdy](#5-wspólne-źródła-prawdy)
6. [Narzędzia i komendy](#6-narzędzia-i-komendy)
7. [Plan napraw — priorytety](#7-plan-napraw--priorytety)
8. [A. Sekcja Zależności — pełny plan](#a-sekcja-zależności--pełny-plan)
9. [B. UI ustawień — propozycje](#b-ui-ustawień--propozycje)
10. [C. Wydajność — plan](#c-wydajność--plan)
11. [D. Redukcja duplikacji — plan](#d-redukcja-duplikacji--plan)
12. [E. Martwy kod, zależności npm, błędy — plan](#e-martwy-kod-zależności-npm-błędy--plan)
13. [Kolejność wdrożenia](#13-kolejność-wdrożenia)

---

## 1. Opis aplikacji

**Onda** to desktopowy odtwarzacz muzyki i wideo zbudowany na **Electron 43 + Vue 3.5 + TypeScript 5.9 + Tailwind 4**, z:

- **Odtwarzaniem audio** — HTML5 Audio + Web Audio API, gapless, 10-pasmowy EQ, wizualizacja (bars/wave/radial), ReplayGain, zapamiętywanie pozycji.
- **Odtwarzaniem wideo** — fullscreen, PiP, napisy ASS/SRT/VTT (JASSUB wasm), transkodowanie AC3/DTS→AAC chunk-first (ffmpeg), filtry wideo, playback rate.
- **Eksploratorem plików** — 6 trybów widoku (extraSmall→details), virtual scrolling, streaming readdir (batch 200), zakładki, drag&drop plików/zakładek/między oknami, duplikaty, właściwości, schowek.
- **Biblioteką mediów** — skanowanie, metadane ID3/FLAC/MP4, okładki (sharp + cache), widoki Tracks/Video/Folders/Artists/Albums/Images/Playlists, edycja tagów, MusicBrainz, ulubione.
- **ImageViewer** — lightbox, slideshow, Ken Burns, zoom, przejścia.
- **PiP audio** (osobne okno, canvas viz, EQ presets) i **PiP wideo** (osobne okno z JASSUB).
- **Ustawieniami (12 paneli)**, i18n PL/EN (~400 kluczy), tray, global shortcuts, Media Session API, splash screen, command palette, drag&drop plików z systemu.
- **Auto-update** (electron-updater — szkielet).

### Stos technologiczny

| Warstwa | Technologia |
|---|---|
| Runtime | Electron 43.2 |
| UI | Vue 3.5 (`<script setup>`), vue-router 4 (hash), Pinia 3, vue-i18n 11 |
| CSS | Tailwind 4 + CSS vars motywu |
| Build | electron-vite 5 + Vite 7.2, electron-builder 26 |
| Testy | Vitest 3 + jsdom (190 testów) |
| Metadane | music-metadata, node-id3, jsmediatags |
| Napisy | jassub 2.5 (wasm), lfa-ponyfill |
| Grafika | sharp (libvips) |
| Ikony | @lucide/vue |
| Wirtualizacja | @tanstack/vue-virtual |
| Inne | electron-store, @electron-toolkit/utils |

---

## 2. Architektura i modularność

### 2.1 Trzy procesy / wejścia

- **Main process** — `src/main/index.ts` (okna, tray, media-server, registerIPC).
- **Preload** — `src/preload/index.ts` + typy `index.d.ts` (contextBridge → `window.api`, generyczny `invoke<C extends IpcChannel>`).
- **Renderer** — trzy osobne dokumenty HTML:
  - `src/renderer/index.html` — główna aplikacja (`main.ts`, router, App.vue).
  - `src/renderer/pip.html` — PiP wideo (`pip-video-main.ts` → `pip-video/App.vue`).
  - `src/renderer/audio-pip.html` — PiP audio (`pip-audio-main.ts` → `pip-audio/App.vue`).

### 2.2 System modułów

Każdy główny widok to moduł z cyklem życia **`init()` → `activate()` → `deactivate()` → `destroy()`**. Centralny **`ModuleManager`** (`src/renderer/src/modules/ModuleManager.ts`) steruje przełączaniem.

**Moduły** (w `src/renderer/src/modules/`):

| Moduł | Trasa | Uwagi |
|---|---|---|
| `HomeModule` | `/`, `/search` | no-op (`activate`/`deactivate` puste) |
| `PlayerModule` | `/player`, `/audio` | jedyny z realnym `destroy()`/`deactivate()` → `audioEngine` |
| `ExplorerModule` | `/explorer` | `cleanupListeners` nigdy nie wypełniany |
| `LibraryModule` | `/library` | `deactivate` ustawia `isScanning=false` (nie zatrzymuje skanu) |
| `SettingsModule` | `/settings` | no-op |
| `YouTubeModule` | `/youtube`, `/downloads` | no-op |

`ModuleManager.ts:43,53,61` — `deactivate?.()` / `destroy?.()` (metody opcjonalne; zweryfikowane testami).

### 2.3 Przepływ odtwarzania audio

```
audioEngine (singleton, Web Audio API) ──audioEvents (EventBus)──▶ useAudioPlayer
    ▶ subscription (effectScope(true) + watch) ▶ Pinia player store ▶ UI
```

- `audioEngine` **nigdy nie pisze** do store — komunikuje się wyłącznie przez `audioEvents` (`utils/audioEvents.ts`).
- `PlayerView.vue` + `useVideoPlayer.ts` — niezależny stan `<video>`; secondary audio przez `audioEngine.seekSecondaryAudio()`.
- Audio gra w tle podczas nawigacji (specjalna ścieżka w `router/index.ts:86-95`).

### 2.4 IPC

Zarejestrowane w `src/main/ipc/handlers.ts` (orkiestrator), wołane z `index.ts:233`. Typy kanałów w `src/shared/types/ipc.ts` (`IpcChannels`, `IpcChannel`). Pliki handlerów:

`fs-handlers`, `media-handlers`, `library-handlers`, `subtitle-handlers`, `cover-cache`, `cover-handlers`, `dialog-handlers`, `dependency-handlers`, `settings-handlers`, `playback-handlers`, `youtube-handlers`, `musicbrainz` + helpery `dependency-utils`, `youtube-utils`.

Dodatkowo: `window-ipc.ts` (window/fullscreen — fix per-window przez `BrowserWindow.fromWebContents(event.sender)`), `media-server.ts`, `protocol.ts` (`onda://`), `pip-manager.ts`, `audio-pip-manager.ts`, `pip-preview.ts`.

### 2.5 Store (Pinia, setup stores)

`player`, `player-cover`, `library`, `explorer`, `settings`, `ui`, `clipboard`, `youtube`.

> Uwaga: `pinia-plugin-persistedstate` jest zarejestrowany (`main.ts:28`), ale **żaden store nie deklaruje `persist`** — zależność martwa (do usunięcia lub wdrożenia).

---

## 3. Struktura repozytorium

```
D:\Onda
├─ src/
│  ├─ main/                      # proces główny
│  │  ├─ index.ts                # boot, okna, tray, media-server, registerIPC
│  │  ├─ window-ipc.ts           # IPC okien/fullscreen
│  │  ├─ media-server.ts         # lokalny HTTP serwer mediów (token autoryzacji)
│  │  ├─ protocol.ts             # schemat onda://
│  │  ├─ pip-manager.ts          # PiP wideo
│  │  ├─ audio-pip-manager.ts    # PiP audio
│  │  ├─ pip-preview.ts          # podgląd PiP w ustawieniach
│  │  ├─ ipc/                    # handlery IPC (12 plików + 2 utils)
│  │  │  └─ handlers.ts          # orkiestrator
│  │  ├─ utils/
│  │  │  ├─ exec.ts              # runCommand (spawn bez shella)
│  │  │  └─ sharp.ts             # SharpService (miniatury/resize)
│  │  └─ __tests__/
│  ├─ preload/
│  │  ├─ index.ts                # contextBridge → window.api
│  │  └─ index.d.ts              # typowane API (generic invoke)
│  ├─ renderer/                  # proces renderera (3 wejścia HTML)
│  │  ├─ index.html / pip.html / audio-pip.html
│  │  ├─ src/
│  │  │  ├─ main.ts, i18n.ts, env.d.ts, vitest.setup.ts
│  │  │  ├─ App.vue, router/index.ts, assets/main.css
│  │  │  ├─ views/               # Home, Player, Audio, Library, Explorer,
│  │  │  │                       #   ExplorerWindow, YouTube, Downloads, Settings
│  │  │  ├─ components/          # layout/, player/, audio/, explorer/, library/, settings/
│  │  │  ├─ composables/         # useXxx (useVideoPlayer, useSubtitleRenderer, useAudioPiP…)
│  │  │  ├─ modules/             # ModuleManager + 6 modułów
│  │  │  ├─ stores/              # 8 store'ów Pinia
│  │  │  ├─ types/               # media, settings, explorer, subtitles, youtube
│  │  │  ├─ utils/               # formatters, mediaUrl, fileTypes, subtitleConvert,
│  │  │  │                       #   thumbLoader, fileDrag, tabDrag, explorerTabDrop,
│  │  │  │                       #   imageTransitions, audioEvents, constants
│  │  │  ├─ locales/             # pl.ts, en.ts
│  │  │  ├─ pip-video/           # App.vue + style (PiP wideo)
│  │  │  └─ pip-audio/           # App.vue + style (PiP audio)
│  │  └─ public/fonts/           # 19 fontów dla napisów
│  └─ shared/                    # kod współdzielony między procesami
│     ├─ constants.ts            # VIDEO_EXTS, AUDIO_EXTS, IMAGE_EXTS
│     ├─ helpers.ts              # errMsg
│     ├─ logger.ts               # wspólny logger
│     └─ types/ipc.ts            # IpcChannels
├─ electron-builder.yml          # packaging
├─ electron.vite.config.ts
├─ vitest.config.ts
└─ package.json
```

---

## 4. Zależności zewnętrzne (nie-NPM)

Aplikacja w czasie działania wymaga narzędzi systemowych (instalowanych z Ustawień → Dependencies):

| Narzędzie | Do czego | Dziś instalowane przez |
|---|---|---|
| **FFmpeg** | transkodowanie AC3/DTS→AAC, ekstrakcja klatki wideo, ffprobe companion | `choco install ffmpeg` (Win) / `brew`/`apt-get` (Linux) |
| **FFprobe** | duration/metadane wideo | razem z FFmpeg |
| **yt-dlp** | wyszukiwanie YouTube (`yt:search` przez `ytsearch10`) | download z GitHub do `userData/bin` |
| **MKVToolNix (mkvextract)** | wyciąganie czcionek z załączników MKV | `choco install mkvtoolnix` / `brew`/`apt-get` |

### 4.1 Stan obecny (co działa)

- `dep:checkFfmpeg/checkFfprobe/checkYtdlp/checkMkvextract` — sprawdza wersję (`runCommand`).
- `dep:installYtdlp` — jedyny w pełni "managed": pobiera do `userData/bin/yt-dlp(.exe)`, `chmod 0o755`.
- `dep:installFfmpeg/installMkvextract` — `execAsync` stringa shella z menedżerem pakietów.
- Status w electron-store + Pinia (`settings.dependencies`), typ `DependencyStatus { name, installed, version, checkedAt }`.

### 4.2 Luki (dlatego plan A jest priorytetem)

1. **Brak `uninstall` / `update` / `reinstall`** — API i UI znają tylko `install*`.
2. **Windows: tylko choco** — brak winget/scoop; wymaga admina (tylko tekstowa sugestia).
3. **Linux: tylko brew/apt** — brak pacman/dnf/zypper; `echo "unsupported"` zwraca exit 0 → **fałszywy `success: true`** mimo braku instalacji; brak `sudo`.
4. **Brak obsługi architektury** — yt-dlp: `yt-dlp_macos` dla Intel to zła binarka (`_macos_legacy`), brak Linux ARM.
5. **ffmpeg/ffprobe twardo z PATH** — 7 plików woła `ffmpeg`/`ffprobe` bez rozwiązywania managed-bin.
6. **Brak wersjonowania** — nie da się wykryć "jest nowsza wersja".
7. **Download bez progressu/cancelacji/sum kontrolnych/proxy** (mimo że proxy jest w ustawieniach).
8. **UI ubogie** — jeden przycisk "Instaluj", brak paska postępu, ścieżki binarki, detalów błędu.

---

## 5. Wspólne źródła prawdy

Pliki które powinny być jedną definicją (a dziś bywają duplikowane):

| Zasób | Kanoniczne miejsce | Duplikaty do usunięcia |
|---|---|---|
| Rozszerzenia plików | `src/shared/constants.ts` | `src/main/utils/sharp.ts:21`, `src/renderer/src/utils/fileTypes.ts`, `src/renderer/src/utils/constants.ts` (martwe) |
| Mapy MIME | `src/main/media-server.ts:7-29` | `src/main/ipc/library-handlers.ts:14-25` |
| Formatowanie czasu | `@shared` (nowy `formatTime`) | `formatters.ts`, `youtube-utils.ts:14`, `pip-audio/App.vue:64`, `pip-video/App.vue:52` |
| URL media | `src/renderer/src/utils/mediaUrl.ts` (`toMediaServerUrl`) | — (już ujednolicone) |
| Logger | `src/shared/logger.ts` | — (już ujednolicone) |
| Pozycjonowanie okna PiP | nowy helper `src/main/utils/windowPosition.ts` | `pip-manager.ts:197-230`, `audio-pip-manager.ts:184-217`, `pip-preview.ts:27-36,74-105` |
| Normalizacja ścieżki `onda://` | nowy parser w `@shared` | `pip-manager.ts:41-58`, `protocol.ts:46-60`, `media-server.ts:71-113` |
| `isLibraryFolder` | nowy util w renderer | `ExplorerView.vue:234-237`, `ExplorerContent.vue:83-86` |

---

## 6. Narzędzia i komendy

```bash
npm run dev          # dev server
npm run typecheck    # tsc node + vue-tsc web
npm run lint         # ESLint
npm test             # Vitest (190 testów)
npm run test:watch
npm run build        # typecheck + electron-vite build
npm run build:win    # NSIS
npm run build:mac    # DMG
npm run build:linux  # AppImage/snap/deb
```

---

## 7. Plan napraw — priorytety

| Priorytet | Obszar | Sekcja | Koszt |
|---|---|---|---|
| 1 | **Zależności: managed-bin + uninstall/update/reinstall + UI** | A | duży |
| 2 | **Bugi** (brak importu `Copy`, rozszerzenia obrazów, addTrack) | E | mały |
| 3 | **Wydajność** (shallowRef, rAF throttle, scan progress, lazy-loady) | C | średni |
| 4 | **Redukcja duplikacji** | D | średni |
| 5 | **UI ustawień** (grupowanie, wyszukiwarka, eksport) | B | ✅ WYKONANE (2026-08-03) |
| 6 | **Martwy kod / deps** | E | mały |

---

## A. Sekcja Zależności — pełny plan

Cel: **instalacja, odinstalowanie, przeinstalowanie i aktualizacja każdej zależności działająca na Windows / macOS / Linux** (x64 + arm64), bez wymogu admina tam gdzie to możliwe, z czytelnym UI i pełnym feedbackiem.

### A.1 Koncept: "managed binaries" + fallback systemowy

Wprowadzić spójny model dla wszystkich 4 narzędzi (dziś tylko yt-dlp):

```
resolveBinary('ffmpeg')
  1. userData/bin/ffmpeg(.exe)      ← managed (instalowane przez app)
  2. PATH (systemowe)               ← fallback
```

Gdzie `userData = app.getPath('userData')`, bin dir `join(userData, 'bin')`.

### A.2 Źródła binarek per narzędzie

1. **ffmpeg + ffprobe** — najlepsze: **bundling przez `ffmpeg-static`/`ffprobe-static`** (npm, prebuilt per platform/arch — win x64/ia32, linux x64/ia32/arm/arm64, mac x64/arm64). Zweryfikowane w Context7 (`/descriptinc/ffmpeg-ffprobe-static`).
   - Opcja 1 — w instalatorze: `extraResources` w `electron-builder.yml` + `asarUnpack` → app ma ffmpeg **od razu** po instalacji, bez pobierania.
   - Opcja 2 — na żądanie: kopia binarki z `node_modules` do `userData/bin` przy `dep:installFfmpeg`.
   - `FFMPEG_BIN`/`FFPROBE_BIN` env override (dla zaawansowanych).
2. **yt-dlp** — zostaje download z GitHub, **ale**:
   - arch: `yt-dlp_macos` (arm64) vs `yt-dlp_macos_legacy` (x64), linux x64/arm.
   - Wersjonowanie: fetch `https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest` → porównaj semver z lokalnym → `updateAvailable`.
3. **mkvextract** — brak stabilnych prebuilt per-arch → poprawić menedżery pakietów (A.3).

### A.3 Instalacja przez menedżery pakietów (fallback systemowy)

**Windows** (wykryj dostępny, kolejno): `winget` → `choco` → `scoop`.
- `winget install --id Gyan.FFmpeg -e --silent --accept-package-agreements`
- `choco install ffmpeg -y --no-progress`

**macOS**: `brew install ffmpeg` (Intel i ARM obsługiwane przez Homebrew).

**Linux** (wykryj dystrybucję):
- Debian/Ubuntu: `sudo apt-get install -y ffmpeg`
- Fedora/RHEL: `sudo dnf install -y ffmpeg`
- Arch: `sudo pacman -S --noconfirm ffmpeg`
- `sudo -n true` do sprawdzenia sudo bez pytania o hasło; jeśli brak sudo i jesteś root — bez prefiksu.

**Krytyczne poprawki:**
- **Po każdej instalacji realna weryfikacja**: `resolveBinary` + `--version`; zwróć `success: false` z czytelnym błędem, jeśli nadal brak (usunąć `echo "unsupported"` z exit 0).
- Przed instalacją sprawdź czy menedżer istnieje (np. `winget --version`, `brew --version`, `apt-get --version`).
- Unifikuj w `dependency-utils.ts`: `detectPkgManager(platform)`, `installCmd(tool, pkgManager)`, `uninstallCmd(...)`.

### A.4 Uninstall / Reinstall / Update

**Managed (userData/bin):** uninstall = `rm` pliku; reinstall = download od nowa; update = porównanie wersji + re-download. **Nie wymaga admina.**

**Systemowe (PATH):** uninstall przez menedżer pakietów (odwrotność instalacji):
- Win: `winget uninstall --id Gyan.FFmpeg` / `choco uninstall ffmpeg -y`
- mac: `brew uninstall ffmpeg`
- linux: `sudo apt-get remove -y ffmpeg` / `sudo dnf remove -y ffmpeg` / `sudo pacman -R --noconfirm ffmpeg`

**UI:** przycisk kontekstowy per wiersz — `Instaluj` / `Zaktualizuj` (gdy updateAvailable) / `Przeinstaluj` / `Odinstaluj` (dla managed bezwarunkowo, dla systemowego z potwierdzeniem "zostaną użyte narzędzia menedżera pakietów").

### A.5 Nowe API IPC + preload

Dodać do `src/main/ipc/dependency-handlers.ts`, `src/preload/index.ts`, `index.d.ts` i `IpcChannels`:

- `dep:removeFfmpeg`, `dep:removeMkvextract`, `dep:removeYtdlp` → `{ success, error? }`
- `dep:updateYtdlp` (alias reinstall)
- `dep:checkUpdateYtdlp` → `{ updateAvailable, current, latest }`
- `dep:getPaths` → ścieżki wszystkich binarek (do wyświetlenia w UI)
- Wszystkie `dep:install*` — **emitować progress** `dep:progress` (event) z etapem/percentem; obsłużyć cancel (AbortController).

### A.6 Typ `DependencyStatus`

```ts
interface DependencyStatus {
  name: string;
  installed: boolean;
  version: string | null;
  latestVersion: string | null;   // nowe
  updateAvailable: boolean;        // nowe
  path: string | null;             // nowe (ścieżka binarki)
  managed: boolean;                // nowe (true = userData/bin)
  checkedAt: number;
}
```

### A.7 Nowe UI — `SettingsDependencies.vue` (przeprojektowanie)

- **Nagłówek systemu**: OS + architektura (np. "Windows 11 x64") + toggle "Użyj menedżera pakietów" (managed → system).
- **Wiersze-karty** per zależność:
  - kropka stanu (zielony / bursztyn gdy `updateAvailable` / czerwony),
  - nazwa + opis,
  - wersja lokalna + „(dostępna: vX.Y.Z)" gdy update,
  - ścieżka binarki (`font-mono`, mała),
  - badge „managed" / „system",
  - przyciski: Instaluj / Zaktualizuj / Przeinstaluj / Odinstaluj (disabled per akcja),
  - **pasek postępu** podczas downloadu + przycisk Anuluj.
- **Dialog szczegółów błędu** (zamiast surowego tekstu) + „Skopiuj komendę" (manualna instalacja jako admin).
- **Per-wierszowe „sprawdź ponownie"** (dziś globalny `checkDependencies`).
- Klucze i18n (pl/en): `depUninstall, depUpdate, depReinstall, depCancel, depLatest, depPath, depManaged, depSystem, depDownloading, depCopyCommand, depAvailable`.

### A.8 Rozwiązywanie binarek we wszystkich handlerach

Zastąpić twarde `'ffmpeg'`/`'ffprobe'` na wywołania `resolveBinary(...)` w:
- `src/main/ipc/media-handlers.ts:287,347,393`
- `src/main/ipc/library-handlers.ts:48`
- `src/main/ipc/cover-cache.ts:188,206`
- `src/main/ipc/subtitle-handlers.ts:21,59,82,95,107,187,247`

### A.9 Testy

- `dependency-utils.test.ts` — rozszerzyć: `resolveBinary`, `detectPkgManager`, `installCmd` per (platforma × menedżer), arch yt-dlp.
- Nowy `dependency-handlers.test.ts` — mock `runCommand`/download: instalacja (sukces, fałszywy sukces z `echo`, brak menedżera), uninstall managed vs system, update (updateAvailable true/false).

---

## B. UI ustawień — propozycje

### B.1 Struktura (`SettingsView.vue` — dziś 12 płaskich przycisków) ✅ WYKONANE

**Grupowanie w sekcje** (nagłówki sekcji między grupami):
- **Odtwarzanie**: Playback, PiP, Download, Shortcuts.
- **Wygląd i język**: Appearance, Language, Notifications (Toast).
- **Sieć i usługi**: Network, API Keys, Updates.
- **Biblioteka**: Library Folders, Dependencies.

### B.2 Nowe funkcje ✅ WYKONANE

- **Wyszukiwarka ustawień** na górze panelu — filtruje zakładki (pole + ikona Search; przy aktywnym zapytaniu płaska lista wyników, poza tym grupowane sekcje).
- **Eksport/import ustawień** — nowe kanały `settings:export`/`settings:import` w `settings-handlers.ts` (dialog showSave/open + `writeFile`/`readFile` JSON), typy w `IpcChannels`, przyciski w dolnym pasku boczna (FileDown/FileUp), store `applyImported()`, toasty sukcesu/błędu.
- **Potwierdzenie resetu** do domyślnych — `usePromptDialog` + `ExplorerPromptDialog` (reused) z kluczem `settings.resetConfirm`; po resetce toast.
- **Panel Diagnostics/Logs**: podgląd logów, „Pobierz log", wersje środowiska (Electron/Vue/Node/OS) — blisko Dependencies. *(do zrobienia)*
- **Panel "O aplikacji"**: wersja, licencje, linki. *(do zrobienia)*
- **Globalne ustawienia napisów** (wielkość, pozycja, ścieżka domyślna). *(do zrobienia)*

> Implementacja: `SettingsView.vue` (grupy/sekcja + wyszukiwarka + eksport/import + reset confirm), `settings-handlers.ts` (+`settings:export`/`settings:import`), `stores/settings.ts` (`applyImported`), `locales` pl/en (12 nowych kluczy). Zweryfikowano: typecheck 0, lint 0, 190/190, build OK.

---

## C. Wydajność — plan

| # | Miejsce | Problem | Fix |
|---|---|---|---|
| C1 | `stores/player.ts:36` | `coverCache = ref<Record>` — deep-reactive, rośnie bez limitu | `shallowRef<Record<string, CoverResult>>` + `triggerRef` (jest) + limit ewinkcji |
| C2 | `audioEngine.ts:153-166` | rAF `timeUpdate` 60fps → re-render paska | throttle do ~10–15 Hz gdy pasek widoczny; `startRafLoop` z `lastTime > 50ms` |
| C3 | `useAudioPiP.ts:138-149` | `vizData` co 60 ms + `getState()` co 500 ms podwójnie liczy analyser | wysyłaj vizData tylko gdy okno audio-pip aktywne; cache bins per tick |
| C4 | `pip-audio/App.vue:253` | pętla rAF kręci się nawet bez canvas | usztywnij `scheduleVizIdle` — pełny sleep gdy nieaktywne |
| C5 | `ExplorerContent.vue:263-290` | `onBandMouseMove`: querySelectorAll + getBoundingClientRect na każdy event | wrap w `requestAnimationFrame`/debounce (batch rects) |
| C6 | `useVideoPlayer.ts:374-380` | `watch(currentTime)` → `seekSecondaryAudio` co ~4 Hz | wywołuj tylko przy realnym seeku (watch na `seeking`/przyciskach) |
| C7 | `preload/index.ts:6-7` | 2× `sendSync` na start każdego okna blokują main | zamień na async `ipcRenderer.invoke` + cache wartości |
| C8 | `library-handlers.ts` | skan bez limitu concurrency + brak progress | limit 4 równoległe `subDirPromises`; emit `library:scan:progress` |
| C9 | `media-handlers.ts:272`, `subtitle-handlers.ts:270` | `Array.from(img.imageBuffer)` — MB przez IPC | wysyłaj `Buffer` (structured clone) lub base64 |
| C10 | `App.vue` | statyczne importy QueuePanel/Equalizer/CommandPalette/Toast | `defineAsyncComponent` |
| C11 | `i18n.ts:2-3` | pl + en ładowane zawsze | lazy import locale (dynamiczne `import`) |
| C12 | `useSubtitleRenderer.ts:64-82` | 18 fontów statycznie (SegoeUIEmoji 12MB) w chunk PlayerView | runtime fetch na żądanie |

---

## D. Redukcja duplikacji — plan

| # | Duplikaty | Fix |
|---|---|---|
| D1 | `isLibraryFolder` (`ExplorerView.vue:234`, `ExplorerContent.vue:83`) | nowy util `utils/libraryPath.ts` |
| D2 | Pozycjonowanie okna PiP ×4 | `main/utils/windowPosition.ts` (switch + margin 20 + workAreaSize) |
| D3 | `formatDuration` ×4 (formatters, youtube-utils, pip-audio, pip-video) | `@shared/formatTime.ts` (jedna semantyka, param `hours`/`units`) |
| D4 | Mapy rozszerzeń/MIME rozjechane | źródło w `@shared/constants.ts` + pochodne (`sharp.ts`, `media-server.ts`, `fileTypes.ts`) |
| D5 | Normalizacja `onda://` ×3 | wspólny `parseOndaUrl` w `@shared` |
| D6 | Inicjalizacja JASSUB ×2 (`useSubtitleRenderer`, `pip-video/App.vue`) | współdzielony serwis `subtitleRenderer` (opcjonalnie, większy refactor) |
| D7 | `fallback shell:getFileIcon` ×2 w `useThumbnail.ts:62-101` | wydzielić funkcję `loadFileIcon()` |

---

## E. Martwy kod, zależności npm, błędy — plan

### E.1 Błędy do poprawy (mały koszt, wysoka wartość)

1. **`ExplorerView.vue:543`** — `<Copy :size="14"/>` bez importu → ikona nie renderuje. Dodać `Copy` do importu z `@lucide/vue`.
2. **`src/main/utils/sharp.ts:21`** vs `shared/constants.ts` — GIF/SVG/ICO/TIF nie mają miniatur (brak `.gif .svg .ico .tif`, jest zbędny `.avif`). Ujednolicić z `IMAGE_EXTS`.
3. **`stores/library.ts:248-259`** — `addTrack` mutuje `shallowRef` bez `triggerRef` (używane tylko w testach). Dodać `triggerRef` lub oznaczyć test-only.

### E.2 Zależności npm

| Zależność | Stan | Akcja |
|---|---|---|
| `pinia-plugin-persistedstate` | zarejestrowany, żaden store bez `persist` | usuń albo wdróż persist w store'ach |
| `@vueuse/core` | 1 konsument (ImageViewer: 4 funkcje) | zastąp ręcznie i usuń dep |
| `@electron-toolkit/preload` | eksponuje `window.electron` — zero użyć | usuń ekspozycję (mniejsza powierzchnia ataku) |

### E.3 Martwy stan / kod

- `stores/explorer.ts:33` — `sidebarWidth` (nigdy nieużywany).
- `stores/settings.ts:42` — `cssVariables` (nieużywany; temat robi `App.vue:applyTheme`).
- `HomeModule.ts`, `SettingsModule.ts` — klasy no-op (zostawić tylko jeśli konwencja wymaga, inaczej uprościć do `{ activate() {} }`).
- `stores/library.ts` `scanProgress` — **martwy** (nikt nie emituje `library:scan:progress`); podłącz z C8.
- `src/renderer/src/utils/constants.ts`, `fileTypes.ts` (część eksportów tylko w testach) — przegląd pod kątem usunięcia.

### E.4 Ciche catch

- `pip-video/App.vue:103` — połknięty błąd JASSUB init → `logger.error`.
- `subtitle-handlers.ts:43` — `catch { return [] }` traci błąd ffprobe → `logger.warn` + zwróć `{ error }`.

---

## 13. Kolejność wdrożenia

**Sprint 1 — Zależności (priorytet):**
1. A.2/A.3 — `dependency-utils.ts`: `resolveBinary`, `detectPkgManager`, arch yt-dlp.
2. A.5 — nowe IPC (`dep:remove*`, `dep:update*`, `dep:getPaths`, `dep:progress`) + preload + typy.
3. A.8 — podpiąć `resolveBinary` we wszystkich handlerach ffmpeg/ffprobe.
4. A.7 — przeprojektowanie `SettingsDependencies.vue` + i18n.
5. A.9 — testy.

**Sprint 2 — Bugi i szybkie wygrane:**
6. E.1 (Copy, rozszerzenia obrazów, addTrack).
7. C1 (shallowRef coverCache), C7 (sendSync → async).

**Sprint 3 — Wydajność:**
8. C2/C3/C4 (throttle rAF/viz), C5 (band-select), C6 (seek secondary).
9. C8 (scan progress + concurrency) + podłączyć `scanProgress`.
10. C9/C10/C11/C12 (lazy-loady, Buffer IPC, fonty).

**Sprint 4 — UI ustawień + redukcja:**
11. B.1/B.2 (grupowanie, wyszukiwarka, eksport, potwierdzenia, Diagnostics).
12. D1–D5 (duplikacje), E.2 (deps npm), E.3 (martwy stan).

> Po każdym sprincie: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
