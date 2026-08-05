# Analiza Onda – Co trzeba zrobić

Opracowane na podstawie kodu źródłowego, plan.md i zasady.md. Data: 2026-08-04.

## ✅ Już zrobione (w tej sesji)

### Sprint 1 — Bugi i wydajność
- B1/P1: `coverCache` → `shallowRef` w stores/player.ts:36 (+ `triggerRef` przy aktualizacjach)
- B2: preload/index.ts — usunięte `sendSync`, cała komunikacja przez async `invoke`/`send` (tryInvoke)
- B3: stores/library.ts `addTrack` — mutacja `shallowRef(tracks)` z `triggerRef`
- B4: sharp.ts używa wspólnych `IMAGE_EXTS` z `@shared/constants`
- B5: pip-video/App.vue — błąd inicjalizacji JASSUB logowany (`logger.error`), informacja że napisy wyłączone
- B6: subtitle-handlers.ts — `catch { return [] }` loguje teraz ostrzeżenie ffprobe (`logger.warn`)
- P2: App.vue — QueuePanel, Equalizer, CommandPalette, ToastNotification ładowane przez `defineAsyncComponent`

### Sprint 2 — Duplikacje i martwy kod
- M1: usunięty `pinia-plugin-persistedstate` (rejestracja w main.ts + deps w package.json)
- M2: usunięty `@vueuse/core` (ImageViewer przeszczepiony na czysty Vue)
- M3: usunięta ekspozycja `window.electron` z preload (@electron-toolkit/preload)
- M4: usunięty martwy `sidebarWidth` z stores/explorer.ts
- M5: usunięty martwy `cssVariables` computed z stores/settings.ts
- M6: `scanProgress` realnie podłączony — nasłuch na `library:scan:progress` w stores/library.ts
- M7: usunięte puste klasy `HomeModule`, `SettingsModule` + rejestracje; router odporny na brak modułu
- M8: zweryfikowane — brak duplikatów stałych (renderer używa `@shared/constants`; `utils/constants.ts` to wyłącznie UI-defaults)
- D1: `isLibraryFolder` zduplikowany → wspólny `src/renderer/src/utils/libraryFolders.ts`
- D3: `formatDuration` zduplikowany 4× → `src/shared/formatDuration.ts` (re-eksport w formatters.ts)
- D4: mapy MIME w 4 miejscach → `src/shared/mime.ts` (`getMimeType`), używany przez media-server.ts i library-handlers.ts
- D5: parser URL `onda://` zduplikowany 3× → `media-url-args.ts`, `path-utils.ts`, `pip-position.ts` w src/main
- D6: inicjalizacja JASSUB 2× → wspólny `src/renderer/src/utils/jassub.ts` (`createJassub`), użyty w useSubtitleRenderer i pip-video

### Sprint 5 — Pozostała wydajność (P3–P8)
- P3: i18n.ts — locale ładowane lazy (dynamiczny import, code-split PL/EN) + `loadLocaleMessages()` przy zmianie języka
- P4: onBandMouseMove — cache rectów przy mousedown + throttle przez rAF (maks. 1 przebieg/klatkę)
- P5: useAudioPiP — nasłuch `audio-pip:closed` → isActive=false + stop intervalów (koniec marnowania vizData/getState)
- P6: pip-audio rysowanie canvas — pauza pętli rAF przy `document.hidden` (minimalizacja), start po przywróceniu
- P7: seekSecondaryAudio — tylko przy skoku > 0.5s (seek/scrub), nie przy każdym timeupdate (~4 Hz)
- P8: skan biblioteki — limit równoległości skanowania podkatalogów (pula 16, `mapLimit`) oprócz istniejącego chunkSize=50

### Sprint 3 — Zależności zewnętrzne (plan.md sekcja A)
- A.1: `src/main/binaries.ts` — `getBinDir()` (userData/bin), `resolveBin()`/`resolveBinInfo()` z cache per-process, `invalidateBinaries()` po instalacji/usunięciu
- A.2: `dependency-utils.ts` przepisany — `toolFileName()`, `managedBinPath()`, `ytdlpDownloadUrl(platform, arch)` (arm64→`yt-dlp_macos`, x64→`yt-dlp_macos_legacy`, linux arm→`yt-dlp_linux_aarch64`), `ytdlpShaUrl()`, `ffmpegDownloadUrl()`, `whichInPath()` (PATHEXT), `readVersion()`, `resolveBinary()` (managed→PATH), `detectPkgManager()` (winget→choco→scoop / brew / apt→dnf→pacman), `pkgInstallCmd()`, `pkgUninstallCmd()`; zachowany `getMkvExtractCandidates()`; alias `ytdlpBinaryName()`
- A.3: `dependency-handlers.ts` przebudowany — pobieranie z progress+abort (AbortController), `fetchLatestYtdlpVersion()` (GitHub API), `sha256OfFile()`, `installYtdlpManaged()` z weryfikacją SHA-256 i kanałem `dep:progress`, `installFfmpegManaged()` (Windows, BtbN zip → Expand-Archive/tar → ffmpeg.exe+ffprobe.exe), `installSystem()` z realną weryfikacją + kopiowalną komendą w błędzie, `uninstallTool()`, `checkTool()`
- A.4: `src/main/ipc/zip-utils.ts` — `findFile()` rekurencyjnie
- A.5: nowe IPC: `dep:getPaths`, `dep:checkUpdateYtdlp`, `dep:cancelInstall`, `dep:installMkvextract`, `dep:updateYtdlp`, `dep:removeYtdlp`, `dep:removeFfmpeg`, `dep:removeMkvextract`
- A.6: preload/index.ts + index.d.ts + env.d.ts — nowe API; check* zwracają `{installed, version, path, managed}`
- A.7: main.ts rejestracja handlerów (usable w prod i dev)
- A.8: twarde `'ffmpeg'`/`'ffprobe'` zastąpione przez `(await resolveBin('...')) || '...'` w cover-cache.ts, media-handlers.ts, library-handlers.ts, subtitle-handlers.ts; `getYtdlpPath` → `resolveBin('yt-dlp')` w youtube-handlers.ts; `getMkvExtractPath` → `resolveBin('mkvextract')`
- A.9: `SettingsDependencies.vue` przeprojektowany — pasek postępu (`dep:progress`), anulowanie, aktualizacja yt-dlp (`dep:checkUpdateYtdlp`/`dep:updateYtdlp`), odinstalowanie, badge managed/system, path, kopiowalna komenda z błędu
- A.10: `DependencyStatus` rozszerzony (path, managed, latestVersion, updateAvailable); stringi i18n pl/en (depManaged, depSystem, depUpdateAvailable, depUpdate, depUninstall, depCancel, depUpToDate)
- A.11: testy dependency-utils rozszerzone o `ytdlpDownloadUrl` z arch

## 🔴 Bugi / Błędy (do naprawy natychmiast)

| #  | Plik                         | Problem | Status |
|----|------------------------------|---------|--------|
| B1 | stores/player.ts:36          | coverCache to ref<Record> zamiast shallowRef — deep-reactive, Vue śledzi każdy klucz | ✅ naprawione |
| B2 | preload/index.ts:6-7         | 2× ipcRenderer.sendSync blokuje synchronicznie Main Process | ✅ naprawione |
| B3 | stores/library.ts:248        | addTrack mutuje shallowRef bez triggerRef | ✅ naprawione |
| B4 | main/utils/sharp.ts:21       | Rozszerzenia obrazów nie zgadzały się z IMAGE_EXTS | ✅ naprawione |
| B5 | pip-video/App.vue:103        | Połknięty błąd inicjalizacji JASSUB — brak logu | ✅ naprawione |
| B6 | subtitle-handlers.ts:43      | catch { return [] } traci błąd ffprobe | ✅ naprawione |

## 🟡 Wydajność (freeze, zacięcia, pamięć RAM)

| #  | Plik                       | Problem | Priorytet |
|----|----------------------------|---------|-----------|
| P1 | stores/player.ts:36        | ref<Record> na coverCache (patrz B1) | ✅ naprawione |
| P2 | App.vue                    | QueuePanel, Equalizer, CommandPalette, ToastNotification statyczne | ✅ naprawione |
| P3 | i18n.ts:2-3                | Oba locale PL + EN ładowane synchronicznie na starcie | ✅ naprawione |
| P4 | ExplorerContent.vue:263-290 | onBandMouseMove: querySelectorAll + getBoundingClientRect bez throttle/rAF | ✅ naprawione |
| P5 | useAudioPiP.ts:138-149     | vizData co 60ms + getState() co 500ms nawet gdy PiP zamknięte | ✅ naprawione |
| P6 | pip-audio/App.vue:253      | Pętla rAF rysuje canvas gdy okno zminimalizowane | ✅ naprawione |
| P7 | useVideoPlayer.ts:374-380  | watch(currentTime) → seekSecondaryAudio ~4 Hz przy scrubbingu | ✅ naprawione |
| P8 | library-handlers.ts        | Skan folderów bez limitu równoległości | ✅ naprawione |

## 🟡 Duplikacja kodu (do refaktoryzacji)

| #  | Problem                              | Lokalizacja | Status |
|----|--------------------------------------|-------------|--------|
| D1 | isLibraryFolder zduplikowany          | ExplorerView.vue:234 i ExplorerContent.vue:83 | ✅ zrobione |
| D2 | Logika pozycjonowania okna PiP zduplikowana 3× | pip-manager.ts, audio-pip-manager.ts, pip-preview.ts | ✅ zrobione (pip-position.ts) |
| D3 | formatDuration zduplikowana 4×        | formatters.ts, youtube-utils.ts, pip-audio/App.vue, pip-video/App.vue | ✅ zrobione |
| D4 | Mapy rozszerzeń/MIME w 4 miejscach    | sharp.ts, media-server.ts, fileTypes.ts, constants.ts | ✅ zrobione (shared/mime.ts) |
| D5 | Parser URL onda:// zduplikowany 3×    | pip-manager.ts, protocol.ts, media-server.ts | ✅ zrobione |
| D6 | Inicjalizacja JASSUB 2×               | useSubtitleRenderer.ts i pip-video/App.vue | ✅ zrobione (utils/jassub.ts) |

## 🔵 Martwy kod i nieużywane zależności

| #  | Problem                                    | Lokalizacja | Status |
|----|--------------------------------------------|-------------|--------|
| M1 | pinia-plugin-persistedstate — żaden store nie używa persist | main.ts:3, package.json | ✅ usunięte |
| M2 | @vueuse/core używany tylko w ImageViewer.vue | Można zastąpić ręcznie | ✅ usunięte |
| M3 | @electron-toolkit/preload eksponuje window.electron — zero użyć | preload/index.ts | ✅ usunięte |
| M4 | sidebarWidth w store explorera — nigdzie nie używany | stores/explorer.ts:33 | ✅ usunięte |
| M5 | cssVariables computed w store ustawień | stores/settings.ts:43 | ✅ usunięte |
| M6 | scanProgress — nikt nie emituje library:scan:progress | stores/library.ts:41 | ✅ podłączone |
| M7 | HomeModule, SettingsModule — puste klasy no-op | modules/HomeModule.ts, SettingsModule.ts | ✅ usunięte |
| M8 | utils/constants.ts częściowo zduplikowane z @shared/constants.ts | — | ✅ zweryfikowane (brak duplikatu) |

## 🟠 Zależności zewnętrzne (ffmpeg, yt-dlp…)

To największy technicznie dług aplikacji, opisany szczegółowo w plan.md → sekcja A.

| #  | Problem |
|----|---------|
| Z1 | Brak uninstall / update / reinstall dla ffmpeg, mkvextract | ✅ zrobione (dep:removeFfmpeg/dep:removeMkvextract/dep:updateYtdlp) |
| Z2 | Windows: tylko choco, brak winget/scoop | ✅ zrobione (winget→choco→scoop) |
| Z3 | Linux: fałszywy sukces instalacji (echo "unsupported" zwraca exit 0) | ✅ zrobione (realna weryfikacja binarki, inaczej kopiowalna komenda w błędzie) |
| Z4 | ffmpeg/ffprobe twardo z PATH w 7 plikach — nie szuka w userData/bin | ✅ zrobione (resolveBin we wszystkich 7 plikach) |
| Z5 | Brak paska postępu przy pobieraniu | ✅ zrobione (kanał dep:progress + pasek w UI) |
| Z6 | Brak obsługi architektury ARM dla yt-dlp na macOS/Linux | ✅ zrobione (arch w ytdlpDownloadUrl) |
| Z7 | Brak sprawdzania sum kontrolnych pobranych binarek | ✅ zrobione (SHA-256 przy instalacji yt-dlp) |

## 🔵 Brakujące funkcje (z plan.md)

| #  | Funkcja                                             | Status w plan.md |
|----|-----------------------------------------------------|------------------|
| F1 | Panel Diagnostics/Logs w Ustawieniach (podgląd logów, wersje środowiska) | ✅ zrobione |
| F2 | Panel „O aplikacji" (wersja, licencje)              | ✅ zrobione |
| F3 | Globalne ustawienia napisów (wielkość, pozycja)      | do zrobienia |
| F4 | Auto-update (electron-updater) — tylko szkielet      | ✅ zrobione (pełna implementacja) |
| F5 | Progres skanowania biblioteki realnie podłączony do scanProgress | ✅ zrobione (M6) |

## Proponowana kolejność prac (od najważniejszego)

### Sprint 1 — Bugi i wydajność (szybkie wygrane) — ✅ ukończony
- B1/P1, B2, B3, B4, B5, B6, P2 — wszystkie naprawione

### Sprint 2 — Duplikacje i martwy kod — ✅ ukończony
- M1–M8, D1–D6 — wszystkie zrobione

### Sprint 3 — Zależności zewnętrzne (plan.md sekcja A) — ✅ ukończony
- A.1–A.11 — wszystkie zrobione (managed binarki, progress, update/uninstall, fix Linux/winget/ARM/SHA)

### Sprint 4 — Nowe panele Settings + Auto-update — ✅ ukończony
- Diagnostics/Logs panel: `SettingsDiagnostics.vue` + `diagnostics-handlers.ts` (podgląd logów, wersje środowiska)
- About panel: `SettingsAbout.vue` (wersje środowiska, licencje)
- electron-updater pełna implementacja: `updater.ts` (check/download/progress/quitAndInstall), `updater-handlers.ts`, `SettingsUpdates.vue` (UI + pasek postępu), i18n pl/en
- Automatyczny scheduler `updater-scheduler.ts` — `autoCheck`/`checkInterval` (startup/hourly/daily/weekly), rekonfiguracja przy `settings:set`/import

### Sprint 5 — Pozostała wydajność (P3–P8) — ✅ ukończony
- P3, P4, P5, P6, P7, P8 — wszystkie naprawione

**Najszybsze wygrane do natychmiastowego wdrożenia:** P3 (lazy i18n), P4 (throttle), P5/P6 (wstrzymanie PiP), F3 (ustawienia napisów). Sprinty 1–3 i 5 domknięte — pozostał Sprint 4 (nowe panele Settings + Auto-update).
