# Onda

<div align="center">
  <img src="https://img.shields.io/badge/Electron-43.2-47848f?style=flat&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue.js-3.5-4FC08D?style=flat&logo=vue.js&logoColor=white" alt="Vue 3" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4.3-38B2AC?style=flat&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Vitest-3.2-6E9F18?style=flat&logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/github/v/release/gb-redRabit/Onda?style=flat&label=version&color=605dff" alt="Wersja" />
</div>

<br>

**Onda** to zaawansowany, desktopowy odtwarzacz muzyki i wideo zbudowany na stosie **Electron + Vue 3 + TypeScript + Tailwind CSS**. Odtwarza lokalne pliki audio i wideo, zarządza biblioteką multimediów z metadanymi, eksploruje system plików, wyświetla obrazy, obsługuje napisy (ASS/SRT/VTT), streamuje z YouTube i SoundCloud, pobiera media i oferuje w pełni konfigurowalne motywy w Kreatorze Motywów.

---

**[Pobierz najnowszą wersję](https://github.com/gb-redRabit/Onda/releases)**

## Funkcje

### Odtwarzanie

- **Silnik audio** oparty o Web Audio API, oddzielony od UI (EventBus) — audio gra w tle także przy przełączaniu widoków.
- **10-pasmowy equalizer** z presetami, regulacja głośności, seek, kolejka odtwarzania z przeciąganiem, tasowanie i powtarzanie (all/one/none).
- **Wizualizacje audio** — 8 trybów renderowanych na canvasie z użyciem `AnalyserNode`: bars, spectrum, wave, radial, rings, circle, particles, none. Crossfade między trybami, konfigurowalne kolory (primary/secondary), czułość (sensitivity), wygładzanie (smoothing), limit FPS i jakość renderowania (low/medium/high — DPR cap + liczba elementów).
- **Widok Audio (free canvas)** — pełna swoboda rozmieszczania 5 elementów (wizualizacja, okładka, info utworu, progress, kontrolki) na canvasie z pozycjonowaniem procentowym, warstwami (layer 1–5), przezroczystością i widocznością. 5 presetów layoutu (compact/stacked/split/full/immersive) z natychmiastowym przełączaniem.
- **Edytor layoutu audio** — split-view z mini podglądem (480×320), siatką 1%, drag-and-drop na canvasie, suwaki X/Y/width/height/opacity/layer, show/hide per element, przycisk reset.
- **Fullscreen audio** — prawdziwy Fullscreen API (Escape/F11), auto-hide HUD z konfigurowalnym opóźnieniem (0–10s), przezroczystość HUD (10–100%).
- **Pulse okładki** — subtelna animacja scale(1.0–1.06) zsynchronizowana z basem z `AnalyserNode`.
- **Video cover loop** — okładki wideo (rodzeństwo mp4 przy audio) grają w pętli do przodu (`onended` → `currentTime = 0; play()`); ping-pong odrzucony, bo `playbackRate = -1` nie jest wspierany w Electronie.
- **Marquee tytułu** — długie tytuły i artyści przesuwają się animacją CSS z obliczanym offsetem.
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

### Online (YouTube / SoundCloud) i pobieranie

- Widok **/online** z przełącznikiem platform: YouTube i SoundCloud.
- **Streaming online** — „Odtwórz" na kartach wyników gra bez pobierania (YT przez yt-dlp, SC przez wewnętrzne API z fallbackiem yt-dlp); kolejka streamów z auto-next, cache URL-i (LRU, TTL 2h) i prefetch na hover.
- **Hardening streamów** — retry 403 z backoffem ×4, fallback direct (bez CORS) przy błędzie proxy, re-play w `canplay`, prefetch + warm probe (IntersectionObserver, 300px/600ms), cap współbieżności (4).
- **SoundCloud** — własny klient api-v2 (wewnętrzne API web-aplikacji SC) z automatyczną ekstrakcją `client_id` z bundli, fallback yt-dlp. Wyszukiwanie, sety (playlisty), profile artystów; pobieranie MP3 z tagami ID3 i okładką (fallback yt-dlp dla utworów bez progressive); subskrypcje z auto-download nowych utworów; zapisywanie utworów/setów i batch linków obu platform.
- **Zapisane** (`/saved`) — osobny widok zapisanych utworów/playlist (YT/SC) do szybkiego powrotu, radio online (placeholder „Wkrótce").
- **Wyszukiwanie i nawigacja** — rozpoznawanie linków (wideo / playlista / kanał), widok kanału z zakładkami Wideo/Shorts i nieskończonym przewijaniem, nieskończony scroll w wynikach.
- **Subskrypcje kanałów** — automatyczne sprawdzanie nowych wideo (co 6h), powiadomienia, auto-download.
- **Pobieranie** (yt-dlp) — kolejka audio/wideo, progres, prędkość, ETA, anulowanie, retry/backoff, okładki (miniatura / klatka / clip wideo), metadane, podfoldery kanału/playlisty. Post-process: tagi, okładki, sync z biblioteką, SHA-256 (opcjonalny), napisy. Persystencja kolejki, restore po restarcie (interrupted→paused, pending→re-queued).
- **Integracja z biblioteką** — pobrane pliki lądują w bibliotece (jeśli folder docelowy jest folderem biblioteki).

### PiP (Picture-in-Picture)

- Osobne okna dla wideo i audio, pozycja, rozmiar, always-on-top, podgląd.
- Synchronizacja motywu między głównym oknem a oknami PiP przez IPC (`audio-pip:theme`/`pip:theme`).

### System i integracja

- **Wtyczki** — instalacja z folderu, worker na wtyczkę (sandbox), manifest z uprawnieniami (`storage`, `notifications`, `player`, `visual`), karta wtyczki w Ustawieniach z Logami i statusem oraz poradnik PL/EN.
  - **API** — `api.on` (hooki: `library:scan`, `track:queued`), `api.action` (`player:seek`, `player:enqueue`, `track:toggleFavorite`), `api.storage` (keys/get/set/remove), `api.settings` (get/set), `api.fetch`, `api.notify`, `api.visual` (dekoracje elementów widoku audio), `api.log`.
  - **Komendy** — `api.registerCommand({ id, label, icon, location, shortcut, action })`: dostępne w palecie poleceń, na karcie wtyczki, w pasku widoku audio (`location: 'audio-view'`) i w menu kontekstowym utworu (`location: 'track-menu'`, akcja otrzymuje snapshot utworu).
  - **Konfiguracja** — pole `settings` w manifeście renderowane jako formularz na karcie wtyczki.
  - **Skróty** — globalne skróty klawiszowe komend z walidacją i wykrywaniem kolizji.
- **Autostart** (uruchamianie przy starcie systemu, start zminimalizowany do trayu, ukrywanie do trayu po zamknięciu).
- **Skojarzenia plików** (mp3, flac, ogg, wav, m4a, aac, mp4, mkv, webm, mov, avi) i **single-instance** (otwieranie plików z systemu trafia do istniejącej instancji).
- Globalne skróty (media keys), tray, command palette (Ctrl+K), aktualizacje (`electron-updater`).
- Lokalizacja **PL/EN**, motywy (dark / light / midnight / spotify).

### Motywy i wygląd

- **29 zmiennych semantycznych** zgodnych z daisyUI Theme Generator (kolory 20 + radiusy 3 + rozmiary 2 + border 1 + efekty 2 + szkło 1).
- **4 motywy wbudowane** (dark/light/midnight/spotify) + **Kreator Motywów** (Własny) z live-preview: Baza, Marka (primary/secondary/accent/neutral), Statusy, Geometria (radius/border/size), Szkło (glassAlpha 0–100%), Kopiuj/Wklej JSON.
- **Przezroczyste okno** — `transparent: true` + `--glass-alpha` steruje kryciem; backdrop-filter blur na tłach.
- **Migracja 111 plików** — legacy klasy (`bg-bg-*`, `border-border-*`, `text-fg-*`, `accent-*`) → tokeny semantyczne (`bg-base-*`, `border-base-300`, `text-base-content`, `primary`); 2700 podmian, zero resztek.
- **Radiusy** — `rounded-box` (karty/modale), `rounded-field` (kontrolki), `rounded-selector` (checkboxy/toggle); suwaki geometrii sterują całym UI.
- **Depth/noise** — klasy `.fx-depth`/`.fx-noise` na polach/kartach, przełączniki w Kreatorze.

### Ustawienia (9 grup w 6 sekcjach)

Odtwarzanie · Wygląd · Motyw · Biblioteka · Sieć · System · Zaawansowane (Eksplorator, Klucze API, SystemInfo)

- **Reorganizacja** — 16 zakładek → 9 grup w 6 sekcjach z ikonami i opisami.
- **Wyszukiwarka ustawień** — filtruje po kluczach PL/EN (jak CommandPalette).
- **Eksport/import** — JSON (sekrety przez safeStorage, nigdy plaintext).
- **Zaawansowane ustawienia** — cache okładek (500–10000), max pobierania (1–8), limit prędkości, retry/backoff, crossfade (0–12s), preload strumieni, głośność per źródło, sleep timer, jakość per platforma (YT/SC), proxy per platforma, log level, telemetria OFF.

---

## Stos technologiczny

| Komponent      | Technologia                                  |
| -------------- | -------------------------------------------- |
| Runtime        | Electron 43.2                                |
| Frontend       | Vue 3.5 (Composition API, `<script setup>`)  |
| Język          | TypeScript 5.9 (strict)                      |
| Builder        | electron-vite 5 + Vite 7.2                   |
| Style          | Tailwind CSS 4.3 + daisyUI (theme values)    |
| Stan           | Pinia 3                                      |
| Lokalizacja    | vue-i18n 11 (PL/EN, 942 kluczy)              |
| Routing        | vue-router 4 (hash history, lazy loading)    |
| Metadane       | music-metadata, node-id3                     |
| Wirtualizacja  | @tanstack/vue-virtual                        |
| Obrazy         | sharp (libvips)                              |
| Napisy         | jassub (Wasm)                                |
| Watcher plików | chokidar                                     |
| Testy          | Vitest 3 + jsdom                             |
| Pakiety        | electron-builder (NSIS/DMG/AppImage/deb/rpm) |
| Streaming      | yt-dlp (nightly), SoundCloud api-v2          |

---

## Zależności zewnętrzne (nie-NPM)

Niektóre funkcje wymagają narzędzi systemowych — status można sprawdzić i zainstalować w panelu **Ustawienia → Zależności**:

- **FFmpeg / FFprobe** — transkodowanie audio w locie, ekstrakcja klatek, miniatury.
- **yt-dlp** — pobieranie z YouTube i SoundCloud (fallback dla API), nightly builds.
- **MKVToolNix (mkvextract)** — ekstrakcja osadzonych czcionek z `.mkv`.

---

## Uruchomienie

Wymagania: **Node.js ≥ 22.12**.

```bash
npm install
npm run dev
```

### Testy

Aplikacja zawiera **708 testów** (Vitest, 56 plików):

```bash
npm test
npm run test:watch
```

### Build

```bash
npm run build          # typecheck + build (main/preload/renderer)
npm run build:win      # instalator NSIS (Windows)
npm run build:mac      # DMG (macOS)
npm run build:linux    # AppImage / deb / rpm (Linux)
```

### Podpisywanie instalatorów

Buildy publikowane z CI są **niespodpisywane** (Windows SmartScreen pokaże
„Unknown publisher", macOS Gatekeeper wymusi otwarcie przez prawy przycisk →
Open): podpisywanie wymaga certyfikatu Authenticode (Windows) i Apple
Developer ID (macOS), patrz sekcja signing w `electron-builder.yml`. Do czasu
ich dodania nie włączaj `verifyUpdateCodeSignature: true` — inaczej
electron-updater odrzuca własne, niespodpisane aktualizacje.

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
- **shared** — wspólne typy, stałe i helpery (themeModel, builtin-themes, platform, youtube, soundcloud).

Kluczowe koncepty:

- **Separacja audio/wideo** — `AudioEngine` (Web Audio API) jest niezależny od `<video>` i komunikuje się z UI wyłącznie przez EventBus. `AudioEventBus` jedyny kanał engine→renderer.
- **Widok Audio (free canvas)** — jeden silnik layoutu zamiast 3 zduplikowanych szablonów. 5 elementów na canvasie z procentowym pozycjonowaniem, warstwami i presetami. Stan persystowany w `settings.appearance.audioLayout`.
- **Lokalny serwer mediów** — wideo i obrazy są serwowane przez lokalny HTTP z tokenem, obsługą `Range` i fail-closed whitelistą katalogów (omijanie CSP i `file://`). Dwa zestawy rootów: `libraryRoots` (nadpisywane) + `extraRoots` (narastające).
- **Bezpieczeństwo** — `sandbox`, `contextIsolation`, `nodeIntegration: false`, `webSecurity: true`, walidacja argumentów IPC po stronie main, szyfrowanie sekretów (`safeStorage`), allowlisty IPC, media-server token+origins+roots+realpath, redakcja sekretów w logach.
- **Multi-platform streaming** — wspólny rejestr providerów (`platform.ts`), hybrydowy klient SC (api-v2 + fallback yt-dlp), cache URL-i (LRU TTL 2h, hardened z retry 403/backoff), proxy CORS-clean przez media-server.
- **Persystencja** — electron-store (settings, mediaRoots), JSON atomiczny (download-queue, subscriptions, saved-streams), localStorage (biblioteka, settings renderera).

---

## Współpraca

Zgłoszenia i pull requesty mile widziane. Przed commitem uruchom `npm run build` i `npm test`.

## Licencja

[MIT](./LICENSE)
