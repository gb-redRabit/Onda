# Onda

Desktopowy odtwarzacz muzyki i wideo zbudowany na **Electron + Vue 3 + TypeScript + Tailwind CSS**.

Onda obsługuje odtwarzanie lokalnych plików audio/wideo, eksplorację plików, bibliotekę mediów z metadanymi ID3, 10-pasmowy equalizer, wizualizację audio, kolejki odtwarzania, napisy (SRT/VTT/ASS), Picture-in-Picture oraz system motywów.

## Funkcje

- **Silnik audio** — HTML5 Audio + Web Audio API z gapless playback i crossfade
- **Equalizer** — 10 pasm + presety + custom presets + krzywa odpowiedzi częstotliwościowej
- **Wizualizacja** — style bars / wave / radial (Canvas + AnalyserNode)
- **Kolejka i historia** — z drag & drop
- **Napisy** — parser SRT/VTT/ASS, renderowanie ASS przez JASSUB (wasm + worker)
  - Wyciąganie czcionek z MKV (mkvextract), lokalne fonty Windows, Google Fonts fallback
- **Wideo** — fullscreen, Picture-in-Picture, OSD, playback rate
- **Okładki** — embedded, folder images, cover video matching
- **Splash screen** — animowana wizualizacja dźwiękowa na canvas (standalone HTML, zero deps)
- **Dodatkowo** — ReplayGain / normalizacja, zapamiętywanie pozycji, favorites, playlisty, Media Session API, tray icon, global shortcuts, drag & drop z systemu

## Architektura

Aplikacja jest **modułowa** — każdy główny widok (player, explorer, library, youtube, home, settings) jest niezależnym modułem z własnym cyklem życia (`init` → `activate` → `deactivate` → `destroy`). Centralny **ModuleManager** steruje przełączaniem, gwarantując, że poprzedni moduł całkowicie zwolni zasoby przed startem następnego.

Player jest modułem **background-capable** — muzyka gra dalej podczas nawigacji do innych widoków.

Pełna dokumentacja architektury: [`project.md`](./project.md).

## Stos technologiczny

| Warstwa      | Technologia                                 |
| ------------ | ------------------------------------------- |
| Runtime      | Electron 39                                 |
| Framework UI | Vue 3.5 (Composition API, `<script setup>`) |
| Język        | TypeScript                                  |
| Build        | electron-vite + Vite                        |
| CSS          | Tailwind CSS 4                              |
| Stan         | Pinia 3                                     |
| Routing      | vue-router 4 (hash history, lazy loading)   |
| Napisy       | JASSUB (ASS), własny parser SRT/VTT/ASS     |
| Packaging    | electron-builder (NSIS / DMG / AppImage)    |

## Zależności zewnętrzne (nie-NPM)

Niektóre funkcje wymagają narzędzi zewnętrznych (instalowanych z poziomu Ustawień):

- **FFmpeg / FFprobe** — transkodowanie, napisy, metadane, duration, cover (`choco install ffmpeg`)
- **MKVToolNix (mkvextract)** — wyciąganie czcionek z załączników MKV (`choco install mkvtoolnix`)
- **yt-dlp** — pobieranie z YouTube (binary z GitHub Releases)

## Zalecane IDE

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Uruchomienie

### Instalacja

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## Komendy

| Komenda             | Cel                    |
| ------------------- | ---------------------- |
| `npm run dev`       | Dev server             |
| `npm run build`     | Build + typecheck      |
| `npm run typecheck` | Typecheck (node + web) |
| `npm run lint`      | ESLint                 |
| `npm run format`    | Prettier               |
| `npm run start`     | Preview build          |

## Status

- ✅ Fundament i architektura modułowa + splash screen
- ✅ UI skeleton + nawigacja + system motywów
- ✅ Odtwarzacz multimediów (~95%) — audio w tle, wideo z PiP, napisy ASS
- ⏳ Ustawienia (częściowo)
- ⏳ Integracja YouTube, biblioteka mediów, eksplorator plików

Szczegółowa mapa faz: [`project.md`](./project.md) sekcja 11.
