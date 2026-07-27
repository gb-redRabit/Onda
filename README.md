# Onda

Desktopowy odtwarzacz muzyki i wideo zbudowany na **Electron + Vue 3 + TypeScript + Tailwind CSS**.

Odtwarza lokalne pliki audio/wideo, zarządza biblioteką mediów z metadanymi ID3, eksploruje pliki, wyświetla zdjęcia (lightbox z slideshow), obsługuje napisy ASS/SRT/VTT z wyciąganiem czcionek z MKV, 10-pasmowy equalizer, wizualizację audio, kolejki odtwarzania, Picture-in-Picture oraz pełny system motywów.

## Funkcje

### Odtwarzanie
- **Silnik audio** — HTML5 Audio + Web Audio API z gapless playback i crossfade
- **Equalizer** — 10 pasm + presety + custom presets + krzywa odpowiedzi
- **Wizualizacja** — style bars / wave / radial (Canvas + AnalyserNode), 3 layouty AudioView
- **Kolejka i historia** — z drag & drop (przeciąganie, shuffle, repeat all/one/none)
- **Wideo** — fullscreen, Picture-in-Picture, OSD, playback rate (0.2–3.0x), filtry wideo, skip zone
- **Audio AC3/DTS → AAC** — automatyczne transkodowanie chunk-first (~1s do pierwszego dźwięku) dla kodeków niewspieranych przez Chromium
- **Gapless / Crossfade** — preload + swap następnego utworu z opcjonalnym płynnym przejściem
- **ReplayGain** — normalizacja głośności, zapamiętywanie pozycji

### Napisy (ASS/SRT/VTT)
- Renderowanie ASS przez **JASSUB** (wasm + web worker, canvas overlay)
- Parser SRT/VTT/ASS — automatyczne wykrywanie formatu
- Wyciąganie czcionek z załączników MKV (mkvextract)
- Lokalne fonty Windows (19 fontów) + Google Fonts fallback (lfa-ponyfill)
- Wiele ścieżek napisów, przełączanie w locie

### Eksplorator plików
- 6 trybów widoku (extraSmall → details) z virtual scrollingiem (@tanstack/vue-virtual)
- Breadcrumb nawigacja, streaming readdir (batch 200 plików)
- Menu kontekstowe: rename (F2), delete, showInFolder, copyPath, openWith, new folder
- Multi-select, Ctrl+scroll zoom, ikony plików (shell:getFileIcon z LRU cache)
- Otwieranie obrazków w ImageViewer, mediów w Player, folderów bibliotecznych

### ImageViewer (lightbox)
- Przejścia: fade, slide, zoom, swirl, slideUp, slideDown, zoomOut, random
- Zoom (0.2–5x) z debounce + GPU acceleration, rotacja, fit to screen
- Fullscreen API, pokaz slajdów z konfigurowalnym interwałem
- Ken Burns effect, shuffle (Fisher-Yates), progress bar
- Pasek miniaturek z lazy cache + scroll-to-current
- Downscale 1920px przez HTTP server, full-res przy zoom >1.5×

### Biblioteka mediów
- Skanowanie folderów + metadane przez music-metadata (ID3/FLAC/MP4)
- Okładki: lazy loading, memory + disk cache (sharp-resized JPEG), batch processing
- Widoki: Tracks (lista), Video (siatka), Foldery (drzewo), Artyści (karty), Albumy (siatka), Playlisty
- Virtual scrolling we wszystkich widokach
- Edycja tagów ID3 (title, artist, album, year, genre, track, cover)
- MusicBrainz lookup — wyszukiwanie + auto-fill metadanych i okładek
- Playlisty (tworzenie, edycja, usuwanie, dodawanie/usuwanie utworów)
- Ulubione (favorites z persystencją w electron-store)

### Ustawienia (12 paneli)
- Appearance — motyw (dark/light/midnight/spotify), kolor akcentu, rozmiar czcionki
- Playback — cursor hide, prędkość domyślna, filtry wideo
- PiP — pozycja (4 rogi), rozmiar, podgląd na żywo
- Download — ścieżka, jakość
- Shortcuts — podgląd skrótów
- Network — proxy
- API Keys — YouTube, MusicBrainz, Last.fm
- Updates — auto-check
- Toast — pozycja, filtry powiadomień
- Language — PL/EN
- Library — zarządzanie folderami bibliotecznymi
- Dependencies — status + instalacja FFmpeg, yt-dlp, MKVToolbox

### Inne
- **i18n** — pełna internacjonalizacja PL/EN (~400 kluczy), przełączanie locale
- **Picture-in-Picture** — osobne okno z niezależnym odtwarzaniem, napisami i synchronizacją czasu
- **Splash screen** — animowana wizualizacja dźwiękowa na canvas (standalone HTML, zero deps)
- **Media Session API** — systemowe kontrolki multimedialne
- **Tray icon** — Play/Pause, Next, Previous, Show, Quit
- **Global shortcuts** — MediaPlayPause, MediaNextTrack, MediaPreviousTrack, MediaStop
- **Command palette** — Ctrl+K, szybkie wyszukiwanie + akcje
- **Drag & drop** — przeciąganie plików z systemu (webUtils.getPathForFile)
- **Auto-updates** — electron-updater (szkic)

## Architektura

Aplikacja jest **modułowa** — każdy główny widok (player, explorer, library, youtube, home, settings) to niezależny moduł z własnym cyklem życia (`init` → `activate` → `deactivate` → `destroy`). Centralny **ModuleManager** steruje przełączaniem z obsługą zależności i priorytetów.

**Kluczowe zasady:**
- **Audio w tle** — muzyka gra dalej podczas nawigacji do innych widoków
- **Separacja audio/wideo** — niezależny stan czasu i odtwarzania
- **EventBus** — luźne sprzężenie między silnikiem audio a warstwą UI
- **Lokalny HTTP server dla mediów** — `http://127.0.0.1:PORT/?path=` zamiast `file://`/`onda://` dla `<video>`/`<audio>` (omija blokadę CSP przy `webSecurity: true`)
- **IPC podzielony na 13 plików** — fs-handlers, media-handlers, library-handlers, subtitle-handlers, cover-cache, dialog-handlers, dependency-handlers, settings-handlers, playback-handlers, youtube-handlers, musicbrainz, cover-handlers + orkiestrator

Pełna dokumentacja architektury: [`project.md`](./project.md).

## Stos technologiczny

| Warstwa | Technologia |
| ------- | ----------- |
| Runtime | Electron 39.8 |
| Framework UI | Vue 3.5 (Composition API, `<script setup>`) |
| Język | TypeScript 5.9 |
| Build | electron-vite 5 + Vite 7.2 |
| CSS | Tailwind CSS 4.3 |
| Stan | Pinia 3 + pinia-plugin-persistedstate |
| i18n | vue-i18n 11 (PL/EN, ~400 kluczy) |
| Routing | vue-router 4 (hash history, lazy loading) |
| Metadane | music-metadata, jsmediatags, node-id3 |
| Napisy ASS | JASSUB 2.5 (wasm + web worker) |
| Font fallback | lfa-ponyfill (Font Access API) |
| Wirtualne listy | @tanstack/vue-virtual |
| Ikony | @lucide/vue |
| Utilitki | @vueuse/core |
| Obróbka obrazków | sharp (libvips) |
| Testy | Vitest + jsdom |
| Linting | ESLint 9 + Prettier 3 |
| Packaging | electron-builder (NSIS/DMG/AppImage) |

## Zależności zewnętrzne (nie-NPM)

Niektóre funkcje wymagają narzędzi zewnętrznych (instalowanych z poziomu Ustawień → Dependencies):

- **FFmpeg / FFprobe** — transkodowanie audio (AC3/DTS → AAC), napisy, klatka z wideo, duration (`choco install ffmpeg`)
- **MKVToolNix (mkvextract)** — wyciąganie czcionek z załączników MKV (`choco install mkvtoolnix`)
- **yt-dlp** — pobieranie z YouTube (binary z GitHub Releases)

## Uruchomienie

### Instalacja

```bash
npm install
```

### Development

```bash
npm run dev
```

### Testy

```bash
npm test          # 141 testów, 4 pliki (Vitest)
npm run test:watch
```

### Build

```bash
# Windows (NSIS)
npm run build:win

# macOS (DMG)
npm run build:mac

# Linux (AppImage/snap/deb)
npm run build:linux
```

## Komendy

| Komenda | Cel |
| ------- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + build |
| `npm run typecheck` | Typecheck node + web (vue-tsc) |
| `npm run test` | Testy (Vitest) |
| `npm run test:watch` | Testy — watch mode |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run start` | Preview build |
| `npm run build:win` | NSIS installer |
| `npm run build:mac` | DMG |
| `npm run build:linux` | AppImage/snap/deb |

## Status

| Obszar | Status |
| ------ | ------ |
| Fundament i architektura modułowa | ✅ |
| Splash screen | ✅ |
| UI skeleton + nawigacja + system motywów | ✅ |
| Odtwarzacz audio — gapless, crossfade, EQ, wizualizacja, AudioView (3 layouty) | ✅ |
| Odtwarzacz wideo — fullscreen, PiP, napisy ASS/SRT/VTT, OSD | ✅ |
| Transkodowanie AC3/DTS → AAC chunk-first | ✅ |
| Eksplorator plików — 6 widoków, virtual scroll, streaming, context menu | ✅ |
| ImageViewer — lightbox, slideshow, Ken Burns, zoom, przejścia | ✅ |
| Biblioteka mediów — skanowanie, metadane, playlisty, ulubione | ✅ |
| Edycja tagów ID3 + MusicBrainz lookup | ✅ |
| Ustawienia (12 paneli) | ✅ (częściowo) |
| i18n PL/EN | ✅ |
| Picture-in-Picture | ✅ |
| YouTube integration | ❌ (szkielet) |
| Ekran pobierania | ❌ (szkielet) |

Szczegółowa mapa faz i changelog: [`project.md`](./project.md).
