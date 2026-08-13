# Onda

<div align="center">
  <img src="https://img.shields.io/badge/Electron-43.2-47848f?style=flat&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue.js-3.5-4FC08D?style=flat&logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.3-38B2AC?style=flat&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vitest-3.2-6E9F18?style=flat&logo=vitest&logoColor=white" alt="Vitest" />
</div>

<br>

**Onda** to zaawansowany, desktopowy odtwarzacz muzyki i wideo zbudowany na stosie **Electron + Vue 3 + TypeScript + Tailwind CSS**. Odtwarza lokalne pliki audio i wideo, zarządza biblioteką multimediów z metadanymi, eksploruje system plików, wyświetla obrazy, obsługuje napisy (ASS/SRT/VTT) i pobiera media z YouTube.

---

## Funkcje

### Odtwarzanie

- **Silnik audio** oparty o Web Audio API, oddzielony od UI (EventBus) — audio gra w tle także przy przełączaniu widoków.
- **10-pasmowy equalizer** z presetami, regulacja głośności, seek, kolejka odtwarzania z przeciąganiem, tasowanie i powtarzanie (all/one/none).
- **Wizualizacje audio** (circle / bars / particles / wave / radial) renderowane na canvasie z użyciem `AnalyserNode`.
- **Odtwarzanie wideo** — HTML5, pełny ekran, Picture-in-Picture, prędkość 0.2–3.0×, filtry, strefy pomijania (skip zones), OSD.
- **Transkodowanie w locie** (chunk-first) kodeków niewspieranych przez Chromium (np. AC3/DTS → AAC) do osobnego toru audio.
- **Media Session API** — metadata i sterowanie (odtwórz/pauza/następny/poprzedni/seek) z poziomu systemu i ekranu blokady.

### Napisy

- ASS/SRT/VTT/SSA, napisy zewnętrzne i osadzone, renderowanie ASS przez **JASSUB** (Wasm + Web Worker).
- Ekstrakcja czcionek z załączników MKV (`mkvextract`).
- Przełączanie ścieżek napisów w locie.

### Biblioteka multimediów

- Skanowanie folderów z **incremental scan** (niezmienione pliki nie są parsowane ponownie) i **watcherem plików** (`chokidar` — automatyczne odświeżanie przy zmianach na dysku).
- Metadane audio (ID3/FLAC/MP4) przez `music-metadata`, okładki (pamięć + cache na dysku, `sharp`).
- Widoki: lista utworów, siatka wideo/albumów, drzewo folderów, artyści, playlisty, obrazy.
- Edycja tagów ID3, wyszukiwanie/uzupełnianie metadanych z **MusicBrainz**, ulubione, statystyki odtworzeń.

### Eksplorator plików

- Dyski, foldery, zakładki, breadcrumb, 6 trybów widoku z wirtualizacją (`@tanstack/vue-virtual`).
- Zaznaczanie wielokrotne, kopiowanie/przenoszenie/usuwanie, zmiana nazwy, duplikaty, właściwości, terminal, otwieranie w aplikacji domyślnej.
- **ImageViewer** (lightbox) z przejściami, zoomem, rotacją, pokazem slajdów i paskiem miniatur.

### YouTube i pobieranie

- Wyszukiwanie, rozpoznawanie linków (wideo / playlista / kanał), widok kanału z zakładkami Wideo/Shorts i nieskończonym przewijaniem.
- Subskrypcje kanałów z automatycznym sprawdzaniem nowych wideo i powiadomieniami.
- **Pobieranie** (yt-dlp): kolejka audio/wideo, progres, prędkość, ETA, anulowanie, retry i wznowienie, okładki (miniatura / klatka / clip wideo), metadane, podfoldery kanału/playlisty.
- Integracja z biblioteką: pobrane pliki lądują w bibliotece (jeśli folder docelowy jest folderem biblioteki).

### PiP (Picture-in-Picture)

- Osobne okna dla wideo i audio, pozycja, rozmiar, always-on-top, podgląd.

### System i integracja

- **Autostart** (uruchamianie przy starcie systemu, start zminimalizowany do trayu, ukrywanie do trayu po zamknięciu).
- **Skojarzenia plików** (mp3, flac, ogg, wav, m4a, aac, mp4, mkv, webm, mov, avi) i **single-instance** (otwieranie plików z systemu trafia do istniejącej instancji).
- Globalne skróty (media keys), tray, command palette (Ctrl+K), aktualizacje (`electron-updater`).
- Lokalizacja **PL/EN**, motywy (dark / light / midnight / spotify).

### Ustawienia (14 paneli)

Ogólne · Wygląd · Odtwarzanie · PiP · Pobieranie · Skróty · Powiadomienia · Sieć · Klucze API · Aktualizacje · Diagnostyka · Informacje · Biblioteka · Zależności

---

## Stos technologiczny

| Komponent      | Technologia                                 |
| -------------- | ------------------------------------------- |
| Runtime        | Electron 43.2                               |
| Frontend       | Vue 3.5 (Composition API, `<script setup>`) |
| Język          | TypeScript 5.9 (strict)                     |
| Builder        | electron-vite 5 + Vite 7.2                  |
| Style          | Tailwind CSS 4.3                            |
| Stan           | Pinia 3                                     |
| Lokalizacja    | vue-i18n 11 (PL/EN)                         |
| Routing        | vue-router 4 (hash history, lazy loading)   |
| Metadane       | music-metadata, node-id3                    |
| Wirtualizacja  | @tanstack/vue-virtual                       |
| Obrazy         | sharp (libvips)                             |
| Napisy         | jassub (Wasm)                               |
| Watcher plików | chokidar                                    |
| Testy          | Vitest + jsdom                              |
| Pakiety        | electron-builder (NSIS/DMG/AppImage)        |

---

## Zależności zewnętrzne (nie-NPM)

Niektóre funkcje wymagają narzędzi systemowych — status można sprawdzić i zainstalować w panelu **Ustawienia → Zależności**:

- **FFmpeg / FFprobe** — transkodowanie audio w locie, ekstrakcja klatek, miniatury.
- **yt-dlp** — pobieranie z YouTube.
- **MKVToolNix (mkvextract)** — ekstrakcja osadzonych czcionek z `.mkv`.

---

## Uruchomienie

Wymagania: **Node.js ≥ 22.12**.

```bash
npm install
npm run dev
```

### Testy

Aplikacja zawiera **321 testów** (Vitest):

```bash
npm test
npm run test:watch
```

### Build

```bash
npm run build          # typecheck + build (main/preload/renderer)
npm run build:win      # instalator NSIS (Windows)
npm run build:mac      # DMG (macOS)
npm run build:linux    # AppImage / snap / deb (Linux)
```

---

## Skrypty

| Polecenie              | Opis                                        |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Serwer deweloperski z hot reload            |
| `npm run build`        | Typecheck + build produkcyjny               |
| `npm run typecheck`    | Weryfikacja typów (main/preload + renderer) |
| `npm test`             | Testy jednostkowe                           |
| `npm run lint`         | ESLint                                      |
| `npm run format`       | Prettier (formatowanie)                     |
| `npm run format:check` | Sprawdzenie formatowania                    |
| `npm run start`        | Podgląd zbudowanej paczki                   |
| `npm run build:win`    | Instalator Windows (NSIS)                   |

---

## Architektura

Aplikacja ma strukturę modułową z czystym rozdziałem procesów Electrona:

- **main** — cykl życia aplikacji, IPC, media server, downloader, updater, zależności, watcher biblioteki.
- **preload** — ograniczone, typowane API wystawiane do renderera (contextIsolation + sandbox).
- **renderer** — widoki zarządzane przez `ModuleManager` (cykl `init → activate → deactivate → destroy`).
- **shared** — wspólne typy, stałe i helpery.

Kluczowe koncepty:

- **Separacja audio/wideo** — `AudioEngine` (Web Audio API) jest niezależny od `<video>` i komunikuje się z UI wyłącznie przez EventBus.
- **Lokalny serwer mediów** — wideo i obrazy są serwowane przez lokalny HTTP z tokenem, obsługą `Range` i fail-closed whitelistą katalogów (omijanie CSP i `file://`).
- **Bezpieczeństwo** — `sandbox`, `contextIsolation`, `nodeIntegration: false`, `webSecurity: true`, walidacja argumentów IPC po stronie main, szyfrowanie sekretów (`safeStorage`).

Szczegółowe zasady dla współtwórców: [`zasady.md`](./docs/zasady.md), procedura wydania: [`RELEASE.md`](./docs/RELEASE.md).

---

## Współpraca

Zgłoszenia i pull requesty mile widziane. Przed commitem uruchom `npm run build` i `npm test`.

## Licencja

[MIT](./LICENSE)
