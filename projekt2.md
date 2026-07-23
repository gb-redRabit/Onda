# Onda — Projekt 2.0: Diagnoza, Optymalizacja i Rozbudowa

## 1. Stan Obecny (po Sprint 6 — Faza 5)

### 1.1 Statystyki kodu

| Metryka             | Wartość                                          |
| ------------------- | ------------------------------------------------ |
| Pliki źródłowe      | 106 (.ts + .vue + .css + .html)                  |
| Linie kodu          | ~16,439                                          |
| Main process        | 5 plików, ~2,533 linii                           |
| Preload             | 2 pliki, ~287 linii                              |
| Shared              | 2 pliki, ~187 linii                              |
| Renderer            | 95 plików, ~13,397 linii                         |
| Pliki testowe       | 4 (141 testów)                                   |
| Zależności npm      | 38 (17 runtime + 21 dev)                         |
| `typecheck`         | 100% clean                                       |
| `build`             | OK                                               |
| `lint`              | 0 błędów                                         |

### 1.2 Co działa dobrze

- **Modułowość** — ModuleManager z lifecyclem, priorytetami, zależnościami
- **Separacja audio/wideo** — niezależne stany, audio gra w tle przy nawigacji
- **EventBus** — `audioEvents.ts` odsprzęga silnik audio od UI
- **TypeScript strict** — `strict: true`, `noImplicitAny: true`, 0 błędów
- **Height chain** — flex-col + flex-1 zamiast `h-full` (naprawia layouty)
- **Stabilność** — ErrorBoundary, `window.api?.`, try-catch, race condition guards
- **Wydajność** — debounce 300ms, Page Visibility, execAsync, cache fontMap, lazy loading settings
- **Napisy** — JASSUB wasm + web worker + MKV font extraction + Google Fonts fallback
- **Testy** — Vitest + 2 pliki testowe (formatters, fileTypes)
- **Logger** — `logger.info/error/warn` w renderer i main

### 1.3 Co jest do poprawy (z raport.md — niezrealizowane)

| ID    | Problem                                                  | Plik                      | Priority        | Status          |
| ----- | -------------------------------------------------------- | ------------------------- | --------------- | --------------- |
| P2.4  | Brak wirtualizacji dla długich list                      | LibraryView, ExplorerView | Wysoki          | ✅ Wykonane     |
| P2.5  | `reactive(Map)` coverCache — ograniczona reaktywność     | stores/player.ts          | Średni          | 🟡 Częściowo    |
| P2.8  | Lazy loading Lucide ikon w komponentach                  | SettingsView + inne       | Niski           | 🔴 Otwarty      |
| P2.10 | `encodeURI()` brak dla ścieżek z `#`, `?`                | audioEngine.ts            | Niski (rzadkie) | 🟡 Częściowo (audioEngine już ma, ImageViewer też) |
| P3.8  | `createMediaElementSource` może crashować przy reuse     | audioEngine.ts            | Średni          | ✅ Wykonane     |
| P4.5  | DI (dependency injection) — trudne mockowanie            | Wszystkie moduły          | Niski           | 🔴 Otwarty      |
| P4.8  | Puste `init()` w modułach — boilerplate                  | ExplorerModule itp.       | Niski           | 🔴 Otwarty      |
| P5.1  | Tylko 2 pliki testowe — małe pokrycie                    | —                         | Średni          | 🟡 4 pliki/141  |
| P5.2  | `any` w `lfa-ponyfill` i JASSUB (brak typów)             | —                         | Niski           | 🔴 Otwarty      |
| P5.3  | Polskie stringi UI (brak i18n)                           | Wszystkie .vue            | Niski           | ✅ Wykonane     |
| P5.6  | Logger istnieje, ale nie wszędzie używany                | Kilka plików              | Niski           | 🟡 Częściowo    |
| P5.7  | ESLint no-explicit-any = warn (docelowo error)           | eslint.config.mjs         | Niski           | 🔴 Otwarty      |
| P6.2  | yt:* placeholdery (nadal nie zaimplementowane)           | handlers.ts               | Średni          | 🔴 Otwarty      |
| P6.3  | update:* placeholdery                                    | handlers.ts               | Niski           | 🔴 Otwarty      |
| P6.4  | SettingsNetwork, SettingsApiKeys — UI bez backendu       | components/settings/      | Niski           | 🔴 Otwarty      |
| P6.5  | SettingsShortcuts — tylko wyświetla, nie edytuje         | components/settings/      | Niski           | ✅ Wykonane     |
| P6.6  | pip.html/pip.ts — osobny bundle, nie wiadomo czy używany | —                         | Niski           | 🔴 Otwarty      |

---

## 2. Architektura (aktualna)

```
┌─────────────────────────────────────────────┐
│              MAIN PROCESS (5, ~2,533 linii)  │
│  index.ts (367)                              │
│  ├── createWindow() → BrowserWindow          │
│  ├── Tray icon + global shortcuts            │
│  ├── Splash screen (auto-close po 1s)        │
│  ├── pip-manager.ts (421)                    │
│  │   └── PipManager: PiP + preview window    │
│  ├── utils/logger.ts (8)                     │
│  └── ipc/                                    │
│      ├── handlers.ts (1633) — 68 handlerów   │
│      └── musicbrainz.ts (104) — MusicBrainz  │
├─────────────────────────────────────────────┤
│              PRELOAD (2, ~287 linii)          │
│  index.ts (167) → contextBridge: 43 API      │
│  index.d.ts (120) → OndaAPI interface        │
├─────────────────────────────────────────────┤
│              RENDERER (95, ~13,397 linii)     │
│  main.ts (46) → createApp + Pinia + Router   │
│  App.vue (187) → layout + ErrorBoundary      │
│  ├── i18n.ts (10) — vue-i18n setup           │
│  ├── pip.ts (170) — PiP bundle               │
│  ├── router/index.ts (117)                   │
│  │   └── 8 tras + beforeEach guard           │
│  ├── stores/ (6, ~1,265 linii)              │
│  │   ├── player.ts (490) — główny stan       │
│  │   ├── settings.ts (159) — konfiguracja    │
│  │   ├── explorer.ts (196)                   │
│  │   ├── library.ts (259)                    │
│  │   ├── ui.ts (103) — toasty + contextMenu  │
│  │   └── youtube.ts (58)                     │
│  ├── modules/ (8, ~912 linii)               │
│  │   ├── ModuleManager.ts (97)               │
│  │   ├── audioEngine.ts (631) — klasa        │
│  │   └── PlayerModule/ExplorerModule/...     │
│  ├── composables/ (6, ~1,211 linii)         │
│  │   ├── useAudioPlayer.ts (159)             │
│  │   ├── useVideoPlayer.ts (406)             │
│  │   ├── useSubtitleRenderer.ts (375)        │
│  │   ├── usePlayerKeyboard.ts (106)          │
│  │   ├── usePiP.ts (93)                      │
│  │   └── useOpenMedia.ts (72)                │
│  ├── views/ (8 widoków, ~2,145 linii)       │
│  │   ├── HomeView, PlayerView, AudioView     │
│  │   ├── ExplorerView (517) — 4 tryby      │
│  │   ├── LibraryView (623)                   │
│  │   ├── YouTubeView, DownloadsView, Settings│
│  ├── components/ (48, ~4,563 linii)          │
│  │   ├── layout/ (4) — TitleBar, Sidebar..   │
│  │   ├── audio/ (6) — Controls, Visualizer   │
│  │   ├── player/ (6) — Queue, Equalizer..    │
│  │   ├── explorer/ (5) — GridItem, TableRow..│
│  │   ├── library/ (7) — TrackRow, AlbumCard  │
│  │   ├── settings/ (12) — per-zakładka      │
│  │   └── shared/ (5) — CommandPalette, Toast │
│  ├── locales/ (2) — en.ts (392) + pl.ts (393)│
│  ├── types/ (6, ~298 linii)                  │
│  └── utils/ (7, ~390 linii)                  │
└─────────────────────────────────────────────┘
```

---

## 3. Co zrobić — Plan Działania

### Faza 5: YouTube Integration (Priority: WYSOKI) ✅ ZASTĄPIONY

> **Zastąpiony przez Fazę 5 rzeczywistą:** Library Management + ImageViewer + Settings + Explorer

Implementacja pełnej integracji z YouTube przez yt-dlp pozostaje na dalszy plan.

- [x] **5.1–5.5** — Zastąpione przez budowę biblioteki mediów, eksploratora, ustawień i przeglądarki obrazów

### Faza 6: Library Management — Biblioteka mediow (Priority: WYSOKI) ✅ WYKONANE

**Stan:** W pełni zaimplementowana biblioteka audio/wideo z playlistami, edycją tagów, MusicBrainz, okładkami, folderami i wirtualizacją.

- [x] **6.1** IPC handlery: `library:scan`, `library:getAll`, `playlist:*`, `library:folders:*` — zrealizowane
- [x] **6.2** `library.store` — `loadFromDisk()`, `scanFolders()`, `savePlaylists()`, `addFolder()/removeFolder()`
- [x] **6.3** LibraryModule — `activate()` z auto-load + auto-scan
- [x] **6.4** SettingsLibraryFolders.vue — zarządzanie folderami + przycisk skanowania
- [x] **6.5** LibraryPlaylistManager.vue — panel playlist + DnD + sidebar DnD
- [x] **6.6** LibraryTrackRow.vue — wiersz z akcjami (play, fav, context menu, DnD, playlist toggle)
- [x] **6.7** LibraryView — virtualizacja (@tanstack/vue-virtual), video tab, folder browse (DirNode), cover art, search, filter
- [x] **6.8** TrackTagEditor.vue — edycja ID3 tagów (title, artist, album, genre, year, track, cover) przez IPC `media:writeTag` + `media:writeCover`
- [x] **6.9** MusicBrainzLookup.vue — search/lookup albumów, auto-fill tagów + okładki

### Faza 7: Jakość i Testy (Priority: ŚREDNI)

Rozszerzenie pokrycia testami i dalsza poprawa jakości kodu.

**Kroki:**

- [ ] **7.1** Testy jednostkowe dla player store (kolejka, shuffle, repeat)
- [ ] **7.2** Testy dla audioEvents EventBus
- [ ] **7.3** Testy dla safeInvoke (ipc.ts)
- [ ] **7.4** Testy dla audioEngine (mockowanie AudioContext + HTMLAudioElement)
- [ ] **7.5** Testy dla useOpenMedia
- [ ] **7.6** Testy integracyjne dla IPC (supertest-like dla electron IPC)
- [ ] **7.7** Testy E2E (Playwright + electron)

**Cel:** >60% code coverage dla utils/, >30% dla stores/, >20% ogólnie

### Faza 8: Performance (Priority: ŚREDNI)

Dalsza optymalizacja wydajności.

**Kroki:**

- [ ] **8.1** Wirtualizacja LibraryView + ExplorerView (@tanstack/vue-virtual)
  - LibraryView: lista utworów, siatka albumów
  - ExplorerView: FileGrid + FileList
- [ ] **8.2** CoverCache — `reactive(Map)` → `ref<Record<string, CoverResult>>` z `triggerRef`
- [ ] **8.3** Lazy loading Lucide ikon — `defineAsyncComponent` dla wszystkich importów Lucide
- [ ] **8.4** `encodeURI()` dla ścieżek audioSrc — obsługa `#`, `?`, spacji
- [ ] **8.5** Web Worker dla ciężkich operacji:
  - Parsowanie ASS napisów
  - Skanowanie metadanych
  - Hashowanie plików
- [ ] **8.6** lazyHydration dla poniżej-fold komponentów (TitleBar, StatusBar)

### Faza 9: UI/UX (Priority: ŚREDNI)

Poprawa interfejsu i doświadczenia użytkownika.

**Kroki:**

- [ ] **9.1** Command Palette (Ctrl+K) — wyszukiwanie utworów, nawigacja, akcje
- [ ] **9.2** Drag & drop między widokami (Explorer → Queue, Library → Playlist)
- [ ] **9.3** Responsive mini-player (zwijany do małego okienka)
- [ ] **9.4** Lepsze powiadomienia (toast system z historią)
- [ ] **9.5** Skróty klawiszowe — edytowalne przez UI (SettingsShortcuts)
- [ ] **9.6** i18n — internacjonalizacja (pl/en jako pierwsze)
- [ ] **9.7** System czcionek — wybór UI font, skala, ligatury

### Faza 10: Infrastructure (Priority: NISKI)

**Kroki:**

- [ ] **10.1** Auto-update (electron-updater) — pełna implementacja
- [ ] **10.2** File associations (.mp3, .flac, .mp4, .mkv, .m3u)
- [ ] **10.3** Protocol handler (`onda://`)
- [ ] **10.4** NSIS installer — custom branding, shortcut, uninstaller
- [ ] **10.5** Code signing + notarize macOS
- [ ] **10.6** CI/CD (GitHub Actions: lint → typecheck → test → build → release)

### Faza 11: Nowe Funkcje (Priority: NISKI)

**Kroki:**

- [ ] **11.1** Equalizer presets — custom + zapis/import/eksport
- [ ] **11.2** Zapisywanie kolejki do .m3u
- [ ] **11.3** Beat detection (FFT analysis → BPM + viz sync)
- [ ] **11.4** Zaawansowana wizualizacja (Neon, Sunset, Monochrome preset + custom)
- [ ] **11.5** System wtyczek (plugin manifest, API hooks, store hooks)
- [ ] **11.6** Wielo-okienność (osobne okno eksploratora, playlisty)
- [ ] **11.7** Wsparcie dla strumieni (HTTP radio, HLS, DASH)
- [ ] **11.8** Wsparcie dla playlist .m3u8, .pls, .asx (import)

---

## 4. Optymalizacje (Quick Wins — do zrobienia od razu)

| Optymalizacja                                  | Czas  | Zysk                         | Pliki                     |
| ---------------------------------------------- | ----- | ---------------------------- | ------------------------- |
| `reactive(Map)` → `ref<Record>` dla coverCache | 30min | Poprawa reaktywności okładek | `stores/player.ts`        |
| Wirtualizacja LibraryView                      | 2h    | Płynne scroll 10k+ utworów   | `LibraryView.vue`         |
| `encodeURI()` dla ścieżek                      | 15min | Obsługa specjalnych znaków   | `audioEngine.ts`          |
| Lazy loading Lucide                            | 1h    | Mniejszy bundle JS           | `SettingsView.vue` + inne |
| i18n setup (vue-i18n)                          | 3h    | Gotowość pod tłumaczenia     | Nowy plik + zmiany w .vue |

---

## 5. Problemy Architektoniczne (do refaktora)

### 5.1 Nierówna modułowość

**Problem:** Tylko `PlayerModule` faktycznie zarządza lifecyclem. `ExplorerModule`, `LibraryModule`, `HomeModule`, `SettingsModule` mają puste `init()` i trywialne `activate()`/`deactivate()`.

**Rozwiązanie:** Uprościć do 2 kategorii:

- **Full modules** (PlayerModule, YouTubeModule) — pełny lifecycle + audio w tle
- **Simple modules** (reszta) — tylko `activate()` + brak deactivation (widoki stateless)

### 5.2 DI / testowalność

**Problem:** Wszystkie moduły i composables importują zależności bezpośrednio. Nie można podmienić `audioEngine` na mock.

**Rozwiązanie:**

```typescript
// useAudioPlayer.ts
export function useAudioPlayer(audioEngineInstance = audioEngine) { ... }
```

### 5.3 IPC type safety

**Problem:** `window.api.invoke(channel, ...args)` jest typu `Promise<any>` — brak type checking kanałów i argumentów.

**Rozwiązanie:**

```typescript
// types/ipc.ts
interface IpcChannels {
  'settings:get': { args: []; result: Partial<AppSettings> };
  'settings:set': { args: [data: Partial<AppSettings>]; result: boolean };
  // ... każdy kanał ma args i result
}

type IpcInvoke = <C extends keyof IpcChannels>(
  channel: C,
  ...args: IpcChannels[C]['args']
) => Promise<IpcChannels[C]['result']>;
```

### 5.4 Brak cache offline

**Problem:** Google Fonts fallback (`lfa-ponyfill`) wymaga internetu. Bez niego napisy używają tylko lokalnych fontów.

**Rozwiązanie:** Cache fontów na dysku (electron-store + baza fontów)

---

## 6. Mierniki Jakości

| Obszar                   | Obecnie                 | Cel (Q3 2026)    | Cel (Q1 2027)    |
| ------------------------ | ----------------------- | ---------------- | ---------------- |
| typecheck                | 0 błędów                | 0 błędów         | 0 błędów         |
| lint errors              | 0                       | 0                | 0                |
| Testy                    | 141 (4 pliki)           | 200+ (15 plików) | 500+ (30 plików) |
| Code coverage            | 0%                      | >30%             | >60%             |
| Liczba `any`             | 7 (warn)                | 0                | 0                |
| TODO w kodzie            | 2                       | 0                | 0                |
| Console.error w renderer | 0 (logger)              | 0                | 0                |
| Bundle size (renderer)   | ~448 KB JS + ~2 MB WASM | <400 KB JS       | <350 KB JS       |

---

## 7. Zależności do dodania

| Pakiet                | Faza | Cel                     |
| --------------------- | ---- | ----------------------- |
| `@vueuse/electron`    | 5    | IPC wrappers            |
| `better-sqlite3`      | 6    | Local DB dla biblioteki |
| `vue-i18n`            | 9    | Internacjonalizacja     |
| `@vueuse/motion`      | 9    | Animacje                |
| `pinia-colada`        | 7    | Async state management  |
| `playwright`          | 7    | E2E tests               |
| `@vitest/coverage-v8` | 7    | Code coverage           |

---

## 8. Podsumowanie

**Stan realizacji:**

| Faza               | Status        | Zrobione                                       |
| ------------------- | ------------- | ---------------------------------------------- |
| Faza 5 (YouTube)    | 🟡 Zastąpiony | Zastąpiony przez rzeczywistą Fazę 5 (Library)  |
| Faza 6 (Library)    | ✅ Wykonane   | Biblioteka, playlisty, tagi, MusicBrainz       |
| Faza 7 (Jakość)     | 🔴 Otwarty    | 141 testów, ale nadal niskie pokrycie          |
| Faza 8 (Perform.)   | 🟡 Częściowo  | coverCache LRU, lazy covers, IntersectionObs.  |
| Faza 9 (UI/UX)      | 🟡 Częściowo  | CommandPalette, Toast, DnD, i18n               |
| Faza 10 (Infrastr.) | 🔴 Otwarty    | .              |
| Faza 11 (Funkcje)   | 🔴 Otwarty    |                                                 |

**Obecne priorytety:**

1. **YouTube Integration** (przywrócona Faza 5) — największa luka funkcjonalna
2. **Faza 7 (Testy)** — pokrycie kodu testami
3. **Faza 10 (Infrastruktura)** — auto-update, CI/CD
4. **Faza 8 (Performance)** — dalsza optymalizacja dużych kolekcji
5. **Faza 9 (UI/UX)** — skróty edytowalne (✅), mini-player, system czcionek

**Ryzyka:**

- yt-dlp wrapper wymaga testów na prawdziwym YouTube (możliwe blokady)
- better-sqlite3 wymaga native build (problemy z electron-rebuild)
- Playwright E2E wymaga CI (dodatkowa konfiguracja)

---

---

## 9. Sprint Naprawczy — Fix Sprint (2026-07-21)

### 9.1 Co zrobiono

| #   | Problem                                                                              | Rozwiązanie                                                                                                                                                                                                               | Pliki                                            |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | **Freeze przy starcie** — biblioteka ładuje się synchronicznie, blokuje main process | Splash zamyka się natychmiast (bez czekania na bibliotekę). `loadFromDisk()` dzieli na fazy: playlists/foldery (eager) → tracks (przez `requestIdleCallback` z timeoutem 3s). Cover loading batchowany po 5 IPC na ramkę. | `index.ts`, `App.vue`, `library.ts`, `player.ts` |
| 2   | **Cover loading flood** — 500 IPC invoke jednocześnie przy starcie                   | `player.loadCover()` wkłada do kolejki (`coverQueue: string[]`), flush po 5 przez `requestIdleCallback`. Usunięto `loadCoversForTracks` z `library.ts`. `LibraryTrackRow` nie woła `loadCover` w `onMounted`.             | `player.ts`, `library.ts`, `LibraryTrackRow.vue` |
| 3   | **Video nie nawiguje za drugim razem**                                               | Usunięto `lastTrackType` guard w watcherze App.vue — zawsze nawiguje do `/player` gdy `currentTrack.type === 'video'`.                                                                                                    | `App.vue`                                        |
| 4   | **Folder file count = 0** dla głęboko zagnieżdżonych                                 | `getTracksInDir` zwraca wszystkie pliki rekurencyjnie (przez `startsWith`). Nowa `getDirectTracksInDir` dla listowania. Nowy komponent `DirNode.vue` z rekurencyjną strukturą.                                            | `DirNode.vue`, `LibraryView.vue`                 |
| 5   | **Czyszczenie kolejki przed odtworzeniem**                                           | `playTracks()` → `clearQueue()` + `addToQueueMultiple` + `setTrack` + `play()`. Dotyczy folderów, playlist, artistów, albumów.                                                                                            | `LibraryView.vue`, `Sidebar.vue`                 |
| 6   | **Playlisty nie widoczne od razu**                                                   | `library.loadFromDisk()` wołane w `App.vue.onMounted` (nie dopiero w LibraryModule).                                                                                                                                      | `App.vue`                                        |
| 7   | **Brak okładek wideo**                                                               | `<video>` dla coverów typu `'video'` z `autoplay muted loop`. Kafelki w LibraryView też pokazują cover.                                                                                                                   | `LibraryTrackRow.vue`, `LibraryView.vue`         |
| 8   | **Loading state w HomeView**                                                         | Skeleton placeholders podczas `isLoading` / `!isLoaded`.                                                                                                                                                                  | `HomeView.vue`                                   |

### 9.2 Zmiany w architekturze

```diff
- library.loadFromDisk()  →  await (blokuje splash)
+ library.loadFromDisk()  →  nieblokujące: playlists/foldery natychmiast, tracks przez IdleCallback
- loadCover()  →  IPC invoke natychmiast
+ loadCover()  →  kolejka, flush po 5 przez IdleCallback
- Splash czeka na app:ready z renderer
+ Splash zamyka się po did-finish-load + 1s timer
```

### 9.3 Nowe pliki

| Plik                                              | Opis                               |
| ------------------------------------------------- | ---------------------------------- |
| `src/renderer/src/components/library/DirNode.vue` | Rekurencyjny komponent folder tree |

### 9.4 Statystyki (po sprincie)

| Metryka        | Przed    | Po       |
| -------------- | -------- | -------- |
| typecheck      | 0 błędów | 0 błędów |
| lint errors    | 0        | 0        |
| test           | 34/34    | 34/34    |
| Nowe pliki     | —        | 1        |
| Pliki źródłowe | 87       | 88       |
| TODO/FIXME     | 1        | 1        |

_Ostatnia aktualizacja: 2026-07-23_

---

## 10. Sprint Naprawczy — Fix Sprint 2 (2026-07-22)

### 10.1 Co zrobiono

| #   | Problem                                                                                                                           | Rozwiązanie                                                                                | Pliki                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | **Dane gubione przy edycji tagów** — `NodeID3.write()` zastępuje wszystkie tagi; każdy pominięty tag jest kasowany, w tym okładka | Zastąpiono `write()` → `update()` (merge, nie replace)                                     | `handlers.ts`                                            |
| 2   | **Okładka kasowana po zapisie metadanych** — zapis tylko tagów tekstowych powodował utratę obrazka                                | `writeCover` używa `update()` z samym obrazkiem, zachowując resztę tagów                   | `handlers.ts`                                            |
| 3   | **"An object could not be cloned"** — Vue reactive Proxy trafiał przez IPC do structured clone, który nie umie serializować Proxy | Deep copy `folderTypes` przez `JSON.parse(JSON.stringify(...))` przed `ipcRenderer.invoke` | `LibraryView.vue`                                        |
| 4   | **Brak integracji MusicBrainz** — ręczne wpisywanie tagów                                                                         | Modal `MusicBrainzLookup.vue` + handler `musicbrainz:*` z search/lookup/cover              | `musicbrainz.ts`, `MusicBrainzLookup.vue`, `handlers.ts` |
| 5   | **Brak ulubionych** — szybkie oznaczanie ulubionych utworów                                                                       | Ikona Heart (♥) na liście utworów i w playerze                                             | `LibraryTrackRow.vue`, `PlayerControls.vue`              |
| 6   | **Metadane nie utrzymują się po restarcie** — po edycji tagów stan w bibliotece nie był persistowany                              | Dodano `library:saveScanned` po każdej edycji                                              | `LibraryView.vue`                                        |

### 10.2 Zmiany w architekturze

```diff
- NodeID3.write(tags, path)  →  kasuje wszystkie nieprzekazane tagi
+ NodeID3.update(tags, path)  →  merge'uje tylko przekazane tagi
- IPC args zawierały Vue reactive Proxy (folderTypes)
+ IPC args deep-clone'owane przed transportem
```

### 10.3 Nowe pliki

| Plik                                                        | Opis                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| `src/main/ipc/musicbrainz.ts`                               | MusicBrainz API: searchRelease, lookupRelease, getCoverData |
| `src/renderer/src/components/library/MusicBrainzLookup.vue` | Modal wyszukiwania MusicBrainz z listą release'ów i tracków |

### 10.4 Statystyki (po sprincie 2)

| Metryka        | Przed    | Po       |
| -------------- | -------- | -------- |
| typecheck      | 0 błędów | 0 błędów |
| build          | OK       | OK       |
| Nowe pliki     | —        | 2        |
| Pliki źródłowe | 88       | 95       |
| Linie kodu     | ~8,700   | ~11,800  |

---

## 11. Sprint UI/UX — Sprint 3 (2026-07-22)

### 11.1 Co zrobiono

| #   | Zadanie                                                                              | Rozwiązanie                                                                                                                                                                  | Pliki                                                                                                |
| --- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | **AlbumCard + VideoCard** — dedykowane komponenty siatki                             | `AlbumCard.vue` z cover art + nazwa + artysta; `VideoCard.vue` z cover thumbnail + duration badge                                                                            | `AlbumCard.vue`, `VideoCard.vue`                                                                     |
| 2   | **C1: Context menu** — prawy klik na track/album/video                               | Wykorzystano istniejący `ui.showContextMenu()` (App.vue). Opcje: Odtwórz, Dodaj do kolejki, Edytuj tagi, Pokaż w folderze, dodaj/usuń z playlisty (togglowanie)              | `LibraryTrackRow.vue`, `AlbumCard.vue`, `VideoCard.vue`                                              |
| 3   | **C2: Drag & drop do playlist** — przeciąganie tracków                               | HTML5 DnD: `draggable="true"` + `dataTransfer` z JSON-em ścieżek. Sidebar i LibraryPlaylistManager obsługują drop z wizualnym highlightem (ring)                             | `LibraryTrackRow.vue`, `AlbumCard.vue`, `VideoCard.vue`, `Sidebar.vue`, `LibraryPlaylistManager.vue` |
| 4   | **Fix: toggle add/remove w playlistach** — nieskończone dodawanie tego samego tracka | `addToPlaylist` w store deduplikuje po `path`. Context menu i inline popup pokazują `−` (usuń) jeśli track już w playliście, `+` (dodaj) jeśli nie                           | `library.ts`, `LibraryTrackRow.vue`                                                                  |
| 5   | **C3: Command Palette (Ctrl+K)** — modal wyszukiwania                                | `CommandPalette.vue`: search po tytule/artyście/albumie, nawigacja strzałkami + Enter, szybkie akcje (play, nawigacja). Lupa w TitleBar zamiast `/search`                    | `CommandPalette.vue`, `TitleBar.vue`, `App.vue`                                                      |
| 6   | **C4: Toast notification system** — globalne toasty                                  | `ToastNotification.vue` renderuje `ui.notifications`. 4 typy (info/success/warning/error) z kolorami. Auto-dismiss + przycisk X. Slide-up animacja                           | `ToastNotification.vue`, `ui.ts`                                                                     |
| 7   | **Inline message → toast** — TrackTagEditor, ErrorBoundary, foldery, scan            | `console.error` i inline `message` ref zastąpione `ui.notify()`: zapis tagów, okładki, zmiana nazwy, błąd skanowania, błąd dodawania folderu, błąd renderowania              | `TrackTagEditor.vue`, `ErrorBoundary.vue`, `SettingsLibraryFolders.vue`, `library.ts`                |
| 8   | **PlayerOSD → Toast** — OSD w odtwarzaczu video zastąpione                           | `showOSD()` → `showToast()` → `ui.notify('info', text, undefined, duration)`. Usunięto `PlayerOSD.vue`                                                                       | `PlayerView.vue`, `usePlayerKeyboard.ts`, `useVideoPlayer.ts`                                        |
| 9   | **Toast settings** — pozycja + filtr typów                                           | Nowe `ToastSettings` w store. Visual position picker (kwadrat 2×2). Filtry: Sukces, Informacje, Ostrzeżenia (Błędy zawsze widoczne). Zakładka "Powiadomienia" w ustawieniach | `settings.ts`, `constants.ts`, `ToastNotification.vue`, `SettingsToast.vue`, `SettingsView.vue`      |
| 10  | **Visual position pickers** — PiP i sidebar też                                      | Te same wizualne selektory pozycji (kwadrat 2×2 dla PiP, prostokąt 2×1 dla sidebar) zamiast przycisków                                                                       | `SettingsPiP.vue`, `SettingsAppearance.vue`                                                          |
| 11  | **Usunięto SearchView** — zastąpiony przez Command Palette                           | `/search` route usunięty, `SearchView.vue` skasowany                                                                                                                         | `router/index.ts`, `SearchView.vue`                                                                  |

### 11.2 Zmiany w architekturze

```diff
+ AlbumCard.vue, VideoCard.vue  —  reusable grid cards
+ CommandPalette.vue  —  Ctrl+K modal search
+ ToastNotification.vue  —  globalny system toastów
+ SettingsToast.vue  —  konfiguracja powiadomień
- SearchView.vue  —  zastąpiony Command Palette
- PlayerOSD.vue  —  zastąpiony ToastNotification
```

### 11.3 Nowe pliki

| Plik                                                     | Opis                               |
| -------------------------------------------------------- | ---------------------------------- |
| `src/renderer/src/components/library/AlbumCard.vue`      | Karta albumu z cover art           |
| `src/renderer/src/components/library/VideoCard.vue`      | Karta video z thumbnail + duration |
| `src/renderer/src/components/CommandPalette.vue`         | Command Palette (Ctrl+K)           |
| `src/renderer/src/components/ToastNotification.vue`      | Globalny system toastów            |
| `src/renderer/src/components/settings/SettingsToast.vue` | Ustawienia powiadomień             |

### 11.4 Statystyki (po sprincie 3)

| Metryka        | Przed    | Po       |
| -------------- | -------- | -------- |
| typecheck      | 0 błędów | 0 błędów |
| build          | OK       | OK       |
| Nowe pliki     | —        | 5        |
| Usunięte pliki | —        | 2        |
| Pliki źródłowe | 95       | 98       |

---

## 12. Sprint 4 — Performance + Bug Fixes (2026-07-22)

### 12.1 Co zrobiono

| #  | Problem                                                              | Rozwiązanie                                                                                                                                                             | Pliki                                                             |
| -- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1  | **Crossfade silence** — po crossfade nowy utwór cichy                 | Po swap: `sourceNodeB.connect(crossfadeGainA)` zamiast zostawiać B na `crossfadeGainB` (gain=0)                                                                         | `audioEngine.ts`                                                 |
| 2  | **EQ bypass** — drugi kanał crossfade omijał EQ                      | `crossfadeGainB` podłączony przez EQ chain zamiast bezpośrednio do `gainNode`                                                                                           | `audioEngine.ts`                                                 |
| 3  | **Preload leak** — zmiana utworu nie czyściła preload                 | `loadTrack()` czyści `nextAudioEl`/`sourceNodeB`/`crossfadeTimer`/`isCrossfading`                                                                                       | `audioEngine.ts`                                                 |
| 4  | **videoSourceNode always-recreate** — nowy `<video>` = nowy source    | Dodano `videoEl` field; `disconnectVideoElement()` porównuje referencję zamiast castować na `any`                                                                       | `audioEngine.ts`                                                 |
| 5  | **destroy() cleanup** — `visibilitychange` listener nie usuwany       | `destroy()` usuwa listener i nulluje `videoEl`                                                                                                                          | `audioEngine.ts`                                                 |
| 6  | **prevTrack history** — poprzedni utwór gubiony z historii            | `prevTrack()` przesuwa obecny do `history` przed shiftem poprzedniego                                                                                                    | `player.ts`                                                      |
| 7  | **loadFavorites** — ulubione nie ładowane przy starcie                | `loadFavorites()` wołane z `.catch(() => {})` w setup store                                                                                                              | `player.ts`                                                      |
| 8  | **formatDuration/formatFileSize** — ujemne i ułamkowe dane            | `formatDuration`: clamp do 0 + floor; `formatFileSize`: clamp do 0, `< 1 B` dla ułamków, cap unit index                                                                  | `formatters.ts`, `formatters.test.ts`                            |
| 9  | **Cache memory leak** — `coverResultCache`/`durationCache` bez limitu | Dodano `cacheSet()` z evict (CACHE_MAX_SIZE=5000)                                                                                                                        | `handlers.ts`                                                    |
| 10 | **Persistent cover race condition** — podwójny zapis do store         | Per-file lock przez `coverCacheLocks` Set + `while` wait + `finally` cleanup                                                                                              | `handlers.ts`                                                    |
| 11 | **processInChunks no-op** — promisy startowały przed chunkowaniem     | `filePromises` → `fileTasks` (thunki), procesowane 50 na raz                                                                                                              | `handlers.ts`                                                    |
| 12 | **Volume distortion** — sygnał mnożony 10× przez równoległe filtry    | `ensureEqChain()`: usunięto pętlę `for..connect` do wszystkich filtrów (duplikacja połączeń). Zostawiono tylko szeregowy chain: firstFilter → ... → lastFilter → gainNode | `audioEngine.ts`                                                 |
| 13 | **Brak okładek wideo** — okładka wideo nie pokazywała się dla audio   | Dodano `findSiblingVideo()`: sprawdza pasujący plik wideo PRZED cache. Jeśli znaleziony → zwraca video od razu, omijając cachowaną okładkę obrazkową                      | `handlers.ts`                                                    |
| 14 | **Skanowanie 50/50** — audio processing all-first                     | Zbiórka audio/video osobno, interleave w chunkach (co drugi audio, co drugi video)                                                                                        | `handlers.ts`                                                    |
| 15 | **Zmiana okładki nie odświeżała widoku** — stare cache zwracane       | `writeCover` usuwa z `coverResultCache` + persistent cache. `invalidateCoverCache` woła `loadCover` ponownie                                                              | `handlers.ts`, `player.ts`                                       |
| 16 | **Typ folderu** — 1 video + 99 audio = 'mixed'                       | Ratio: ≥70% audio → 'audio', ≥70% video → 'video', else 'mixed'                                                                                                          | `handlers.ts`                                                    |
| 17 | **dialog:saveFile return type** — brak `canceled`                     | Typ zmieniony na `Electron.SaveDialogReturnValue`                                                                                                                        | `ipc.ts`                                                         |

### 12.2 Performance

| #  | Optymalizacja                                                                  | Pliki                            |
| -- | ------------------------------------------------------------------------------ | -------------------------------- |
| 1  | Lazy loading covers — IntersectionObserver + batch 5 IPC/frame przez IdleCallback | `MediaCover.vue`, `player.ts`    |
| 2  | music-metadata zamiast jsmediatags (szybsze, więcej formatów)                  | `handlers.ts`, `package.json`    |
| 3  | Parallel scanDir — concurrent subdirectories, chunked file processing (50/thunk) | `handlers.ts`                    |
| 4  | Vendor code splitting — `optimizeDeps` w electron-vite                         | `electron.vite.config.ts`        |
| 5  | Lazy AudioContext — tworzony przy pierwszym `ensureEqChain()`                  | `audioEngine.ts`                 |
| 6  | Crossfade transition — direct swap zamiast `setTimeout` fade                   | `audioEngine.ts`                 |

### 12.3 Zmiany w architekturze

- `audioEngine.ts`: pełna refaktoryzacja crossfade — B po swap podłączony przez gainA, EQ chain naprawiony (brak duplikacji połączeń), videoSourceNode z dedykowanym trackingiem
- `handlers.ts`: cache eviction system (in-memory + persistent), per-file lock dla coverów, thunk-based chunking dla scanu, `findSiblingVideo()` przed cache
- `player.ts`: `invalidateCoverCache` teraz też triggeruje `loadCover`

### 12.4 Statystyki (po sprincie 4)

| Metryka        | Przed    | Po       |
| -------------- | -------- | -------- |
| typecheck node | 0 błędów | 0 błędów |
| typecheck web  | 0 błędów | 0 błędów |
| lint           | 0 błędów | 0 błędów |
| testy          | 141 pass | 141 pass |

---

## 13. Sprint 5 — Video Covers + Audio Fixes (2026-07-23)

### 13.1 Co zrobiono

| #  | Problem                                                                                                      | Rozwiązanie                                                                                                                                                                                                                                                                                        | Pliki                                               |
| -- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1  | **AppMenu dropdown zamyka się przy najechaniu** — `@mouseleave="closeDropdown"` na parent bar fire'uje gdy kursor przechodzi z przycisku do dropdownu | Zamieniono na document click-away handler (`onClickAway`) + `ref="menuBar"`. Usunięto `@mouseleave="closeDropdown"`                                                                                                                                                                                | `AppMenu.vue`                                       |
| 2  | **Brak okładek wideo w bibliotece** — ffmpeg extraction timeout przy równoległym skanowaniu, canvas capture też nie działał niezawodnie | `VideoCard` zawsze przekazuje `{ type: 'video', data: path }` jako fallback gdy brak cache. `MediaCover` renderuje `<video preload="auto" muted playsinline>` pokazujące pierwszą klatkę natywnie. tło: `scheduleCoverFlush` → `setTimeout(0)` + batch 5; `captureVideoFrame` → HTML5 canvas fallback | `VideoCard.vue`, `MediaCover.vue`, `player.ts`      |
| 3  | **Brak audio w video** — AudioContext startuje w "suspended". Dla audio `resumeAndPlay()` zawsze wołany, dla video nigdy | `audioEngine.resume()` tworzy AudioContext+EQ chain jeśli nie istnieje. `setTrack()` woła `audioEngine.resume()` dla video w ramach gestu kliknięcia. `setupVideo` → `createMediaElementSource` PRZED `el.src` (Chromium może nie przechwycić audio jeśli source created po src)               | `audioEngine.ts`, `player.ts`, `useVideoPlayer.ts`  |
| 4  | **AC3/DTS audio nie działa** — Chromium nie wspiera tych kodeków nawet natywnie w `<video>`                    | `createMediaElementSource` usunięty dla video → audio gra natywnie przez system. To nie wystarczyło — Chromium nadal nie dekoduje AC3. **Ostateczne rozwiązanie:** ffmpeg wykrywa kodek i transkoduje audio do AAC. Najpierw 30s chunk (~1s) → natychmiastowe odtwarzanie, potem pełny transkoding w tle → cicha podmiana | `handlers.ts`, `audioEngine.ts`, `useVideoPlayer.ts` |
| 5  | **Preload / typy / preload** — dodanie `media:checkAudioCodec`, `media:transcodeAudio`, `media:transcodeAudioChunk` IPC, preload API, type definitions, IpcChannels | 6 plików: handlers.ts, preload/index.ts, preload/index.d.ts, shared/types/ipc.ts, audioEngine.ts, useVideoPlayer.ts. Obsługa offsetu czasowego dla chunków + sync seek/play/pause. Ciche przejście z chunka na pełny plik                                  | 6 plików wymienionych                               |

### 13.2 Zmiany w architekturze

```diff
- createMediaElementSource dla video → problemy z AC3/DTS
+ Video gra natywnie (bez createMediaElementSource), a dla nieobsługiwanych kodeków:
+   1. ffprobe wykrywa kodowanie audio
+   2. ffmpeg transkoduje 30s chunk z aktualnej pozycji (-ss <pos> -t 30) → ~1s
+   3. Chunk odtwarzany przez ukryte <audio> przez Web Audio (pełny EQ/głośność)
+   4. W tle: pełny transkoding całego pliku do AAC
+   5. Gdy gotowe: cicha podmiana (disconnectSecondaryAudio → connectSecondaryAudio)
+   6. Kolejne odpalenia: instant (cache w %TEMP%/onda/audio-transcodes/)
```

### 13.3 Nowe IPC channels

| Kanał                       | Opis                                                       |
| --------------------------- | ---------------------------------------------------------- |
| `media:checkAudioCodec`     | ffprobe: sprawdza kodek audio (AC3 = unsupported)          |
| `media:transcodeAudioChunk` | ffmpeg -ss <pos> -t 30 → szybki chunk ~1s                 |
| `media:transcodeAudio`      | ffmpeg pełny transkoding do AAC                            |
| `media:cleanupTranscodedAudio` | Usunięcie cache audio                                   |

### 13.4 Nowe metody audioEngine

| Metoda                          | Opis                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| `connectSecondaryAudio(path)`   | Tworzy ukryte `<audio>` dla transcoded audio, podłącza do Web Audio |
| `disconnectSecondaryAudio()`    | Czyści secondary audio element + source node                       |
| `seekSecondaryAudio(videoTime)` | Seek w secondary audio z uwzględnieniem offsetu                    |
| `playSecondaryAudio()`          | Play secondary audio                                               |
| `pauseSecondaryAudio()`         | Pause secondary audio                                              |
| `hasSecondaryAudio` (getter)    | Czy secondary audio jest aktywny                                   |

### 13.5 Wykrywane kodeki

| Wspierane (brak transkodu)                | Niewspierane (autotranskod do AAC) |
| ----------------------------------------- | ---------------------------------- |
| AAC, MP3, MP2, Opus, Vorbis, FLAC,       | AC3, E-AC3 (Dolby Digital)         |
| PCM (s16le, s16be, s24le, f32le),        | DTS, DCA                           |
| ALAC, TrueHD                              | WMA, RealAudio, ATRAC, inne        |

### 13.6 Statystyki (po sprincie 5)

| Metryka        | Przed    | Po       |
| -------------- | -------- | -------- |
| typecheck      | 0 błędów | 0 błędów |
| testy          | 141 pass | 141 pass |
| Linii dodanych | —        | ~210     |
| Commit         | b492302  | 212bc76  |

---

## 14. Sprint 6 — Explorer Overhaul + ImageViewer (2026-07-23)

### 14.1 Co zrobiono

| #  | Zadanie                                                                              | Rozwiązanie                                                                                                                                                                                        | Pliki                                                                                            |
| -- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1  | **View modes** — 4 tryby wyświetlania                                                 | `extraSmall` (gęsta lista), `icons` (siatka), `compact`, `details` (tabela). Virtual scrolling dla wszystkich. Overscan reduced do 2.                                                               | `ExplorerView.vue`, `ExplorerGridItem.vue`, `ExplorerTableRow.vue`                               |
| 2  | **Virtual scrolling** — @tanstack/vue-virtual                                         | `useVirtualizer` dla trybów, `will-change: transform` na wierszach. `shallowRef` + `triggerRef` dla `extraSmallIcons` z LRU cache (500)                                                             | `ExplorerView.vue`                                                                               |
| 3  | **Slideshow button fix** — `pointer-events-none` na Lucide icons                     | Lucide SVG nie przepuszcza kliknięć przez warstwę SVG → dodano `pointer-events-none` do wszystkich ikon w przyciskach                                                                              | `ExplorerView.vue`, `ImageViewer.vue`                                                            |
| 4  | **Context menu fix** — brak rename/delete                                             | `@contextmenu.prevent` nie stopował propagacji → `handleEmptyContextMenu` na scrollRef nadpisywał menu. Zmiana na `@contextmenu.stop.prevent`                                                       | `ExplorerView.vue`, `ExplorerGridItem.vue`, `ExplorerTableRow.vue`                               |
| 5  | **Context menu restrukturyzacja**                                                      | `pushSeparator()` helper, max 3 separatory. Wszystkie opcje (rename, delete, showInFolder, copyPath, openWithDefault) dla każdego typu pliku. `:key="idx"` zamiast `:key="item.label"`              | `ExplorerView.vue`, `App.vue`                                                                    |
| 6  | **ImageViewer** — kompletny lightbox                                                  | Dual-image transition system (symultaniczne old-exit / new-enter). 4 tryby: fade, slide, zoom, swirl. Zoom/rotate/fullscreen/wheel/touch. Pasek postępu slideshow                                   | `ImageViewer.vue` (550 linii, przepisany od nowa)                                               |
| 7  | **Thumbnail strip** — pasek miniaturek na dole                                        | Lazy-loaded cache (±4 wokół aktualnego). Przewijalny. Toggle show/hide. Kliknięcie → goTo                                                                                                          | `ImageViewer.vue`                                                                                |
| 8  | **Slideshow settings** — dropdown pod Play                                            | Interval (1s-10s), transition type (fade/slide/zoom/swirl), duration (200-1000ms), loop toggle. Progress bar na górze                                                                               | `ImageViewer.vue`                                                                                |
| 9  | **Fullscreen** — Fullscreen API                                                       | Przycisk Fullscreen (Lucide) + klawisz F. `document.fullscreenElement` + `fullscreenchange` listener                                                                                                | `ImageViewer.vue`                                                                                |
| 10 | **Breadcrumb** — Windows-style display                                                | Split na `\` z `v-if="idx > 0"` → `D:\tapety\Konachan`                                                                                                                                            | `ExplorerView.vue`                                                                               |
| 11 | **Toolbar vertical** — pasek narzędzi po prawej                                       | Przeniesiony toolbar ImageViewer na prawą stronę. Przyciski: Close, Play/Settings, Fit, ZoomIn/Out, Rotate, Fullscreen                                                                             | `ImageViewer.vue`                                                                                |
| 12 | **Readdir streaming** — batch push-based IPC                                          | `fs:readdir` → `event.sender.send('fs:readdir:batch', { done, items })` w batchach 200. Store aktualizowany przez `window.api.on('fs:readdir:batch')`                                               | `handlers.ts`, `explorer.ts`, `preload/index.ts`, `shared/types/ipc.ts`                          |
| 13 | **Settings shortcuts editable** — klik → nagraj → zapisz                              | `SettingsShortcuts.vue` przepisane: click shortcut → listen keydown → `settings.updateShortcut()`                                                                                                   | `SettingsShortcuts.vue`, `settings.ts`, `constants.ts`                                          |
| 14 | **Locale keys** — brakujące tłumaczenia                                               | `explorer.viewMode`, `common.selected`, `common.selectAll`, `common.ok` dodane do en.ts i pl.ts                                                                                                     | `en.ts`, `pl.ts`                                                                                 |
| 15 | **IpcChannels interface** — `fs:mkdir`, `fs:copyPath`, `shell:*`                      | Nowe kanały IPC: `fs:mkdir`, `fs:copyPath`, `shell:showItemInFolder`, `shell:openWithDefault`, `shell:openTerminal`                                                                                | `shared/types/ipc.ts`                                                                            |
| 16 | **Electron security warning suppressed**                                              | `app.commandLine.appendSwitch('no-electrosecurity-warnings')`                                                                                                                                      | `main/index.ts`                                                                                  |
| 17 | **`statSync` fix** — `{ throwIfNoEntry: false }`                                      | Deprecation warning + crash fix                                                                                                                                                                    | `handlers.ts`                                                                                    |
| 18 | **`handleKeydown` typo fix** — `TAGAREA` → `TEXTAREA`                                | Input nie mógł rejestrować skrótów                                                                                                                                                                 | `ExplorerView.vue`                                                                               |
| 19 | **Empty-space context menu** — New folder, Open terminal, Select all                  | `handleEmptyContextMenu()` w ExplorerView                                                                                                                                                           | `ExplorerView.vue`                                                                               |
| 20 | **`prompt()` replacement** — custom Teleport dialog                                   | `prompt()` nie działa w Electron → `<Teleport>` dialog dla rename/new folder                                                                                                                         | `ExplorerView.vue`                                                                               |

### 14.2 Zmiany w architekturze

```diff
+ ExplorerGridItem.vue  —  kafelek siatki z miniaturami
+ ExplorerTableRow.vue  —  wiersz tabeli z detalami
+ ExplorerNavPane.vue   —  lewy panel nawigacyjny
+ ExplorerToolbar.vue   —  górny pasek narzędzi
+ ImageViewer.vue       —  lightbox image viewer (550 linii)
+ IPC streaming: fs:readdir → batch events (fs:readdir:batch)
+ shallowRef + triggerRef dla extraSmallIcons z LRU cache
- `@contextmenu.prevent` → `@contextmenu.stop.prevent` (fix propagation)
```

### 14.3 Nowe IPC channels

| Kanał                       | Opis                                                          |
| --------------------------- | ------------------------------------------------------------- |
| `fs:readdir:batch`          | Main→Renderer: batch plików (200/batch) + done flag           |
| `fs:mkdir`                  | Tworzenie folderu                                              |
| `fs:copyPath`               | Kopiowanie ścieżki do schowka                                  |
| `shell:showItemInFolder`    | Otwiera folder rodzica w explorerze systemowym                 |
| `shell:openWithDefault`     | Otwiera plik domyślną aplikacją                                |
| `shell:openTerminal`        | Otwiera terminal w ścieżce                                     |

### 14.4 Statystyki (po sprincie 6)

| Metryka        | Wartość           |
| -------------- | ----------------- |
| typecheck      | 0 błędów          |
| lint           | 0 błędów          |
| Nowe pliki     | 5                 |
| Pliki źródłowe | 106               |
| Linii dodanych | ~1,842            |
| Linii usuniętych | ~323            |
| Commit         | `30df860` na main |

---

## 15. Sprint 7 — ImageViewer Optimization + Image Pipeline (2026-07-23)

### 15.1 Diagnoza

| Problem | Przyczyna | Skutek |
| ------- | --------- | ------ |
| Zoom freeze przy dużych zdjęciach | `fs:readFile` ładuje pełny plik (20MB → 27MB base64). Brak debounce na wheel. `scale()` bez GPU accel. | Freeze przy zmianie zoomu na zdjęciach >5MB |
| Duże foldery ładują się wolno | Thumbnail strip używa `fs:readFile` (brak dedykowanych miniaturek). Brak preloadu sąsiednich obrazków | Każda nawigacja = pełne IPC read + base64 encode |
| UI niespójne z appką | Hardcodowane `bg-black/*` zamiast theme CSS variables | ImageViewer nie reaguje na zmianę motywu |
| Slideshow podstawowy | Tylko interval + transition. Brak Ken Burns, shuffle | Podstawowe, bez efektów wizualnych |
| Batch thumbnail 5000+ plików | `nativeImage` per-file = jeden wątek, brak cache współdzielonego | Godziny przy skanowaniu biblioteki |

### 15.2 Plan naprawczy

**Runda 1 — kosmetyka + thumbnail IPC (nie naprawiło problemu):**
- [x] CSS vars dla kolorów (bg-bg-*, text-fg-*)
- [x] Debounce wheel 50ms + `scale3d()` + `contain-layout`
- [x] Nowe IPC `media:getThumbnail` — `nativeImage.resize(320)`
- [x] Ken Burns + Shuffle w slideshow

**Runda 2 — file:// + cache dyskowy:**
- [x] `<img src="file:///C:/zdjecie.jpg">` — Chromium otwiera plik natywnie przez Windows WIC → GPU
- [x] Zero IPC, zero base64 dla głównego obrazka
- [x] Thumbnail cache na dysku `%TEMP%/onda/thumbs/<md5>.png`
- [x] Transition przez `@load`, preload przez `new Image()`

**Runda 3 — Sharp + onda:// protocol + downscale (bieżąca):**
- [x] **Sharp (libvips)** — batch thumbnaili z concurrency `n-CPU`, ~4× szybciej niż `nativeImage`
- [x] **Custom protocol `onda://`** — zamiast `file://`. Bezpieczniejszy (path traversal protection), wspiera query params
- [x] **Downscale on-the-fly** — obrazek 20MB → 1920px przez `?w=1920` = ~300KB. Full-res tylko przy zoom >1.5×
- [x] **`nativeImage.createThumbnailFromPath`** — próbuje Windows thumbcache pierwszy, fallback do Sharp
- [x] **Cover art optimized** — okładki audio downscale'owane przez Sharp do 500px przed zapisem cache
- [x] **Batch thumbnail IPC** — `media:batchThumbnails` z concurrency, raportowanie progressu

### 15.3 Architektura — `onda://` protocol

```
Renderer: <img src="onda:///C:/photo.jpg?w=1920">
                           │
                    ┌──────┴──────┐
                    │  protocol   │
                    │  .handle    │
                    │  ('onda')   │
                    └──────┬──────┘
                           │
               ┌───────────┼───────────┐
               │           │           │
               ▼           ▼           ▼
         ?w=1920       ?t=320     bez query
         (downscale)   (thumb)    (full-res)
               │           │           │
               ▼           ▼           ▼
           sharp()    SharpService   net.fetch()
           resize     .getThumbnail  (file://)
               │           │
               ▼           ▼
         Response       Response
         (image/jpeg)   (image/jpeg)
```

### 15.4 Jak to teraz działa vs przed

| Etap | PRZED (base64) | Runda 2 (file://) | Runda 3 (onda:// + Sharp) |
|------|---------------|-------------------|--------------------------|
| IPC | `fs:readFile` (20MB) | 0 | 0 |
| Pamięć renderer | 27MB base64 string | 0 | 0 (downscale 1920px = ~300KB) |
| Pierwsze ładowanie | decode base64 → JPEG | Windows WIC → GPU | sharp() → JPEG 1920px → GPU |
| Zoom | repaint 27MB | GPU scale shader | full-res ładowany dopiero przy >1.5× |
| Thumbnail pojedynczy | `nativeImage` czyta 20MB | nativeImage cache PNG | Windows thumbcache → Sharp fallback |
| Thumbnail batch (5000) | — (brak) | — (brak) | Sharp concurrency n-CPU, ~4× faster |
| Cover art | base64 z tagów | — | Sharp downscale 500px przed cache |
| Bezpieczeństwo | — | ⚠️ XSS → cały dysk | ✅ path traversal protection |

### 15.5 Nowe i zmodyfikowane

**Nowy plik:**
- `src/main/utils/sharp.ts` — SharpService: getThumbnail, batchThumbnails, resize, getMetadata

**Nowy protokół:**
- `onda://` — custom protocol zarejestrowany przez `protocol.registerSchemesAsPrivileged` przed `app.whenReady()`
- Query params: `?w=N` (downscale do N px szerokości), `?t=N` (thumbnail N px)

**Nowe IPC:**
- `media:batchThumbnails` — batch thumbnail generation z concurrency (n-CPU)

**Zmodyfikowane:**
- `index.ts` — +`onda://` protocol registration + handler
- `handlers.ts` — thumbnail przez `createThumbnailFromPath` + Sharp fallback; cover przez Sharp downscale; +batchThumbnails
- `ImageViewer.vue` — `onda://` URLs, downscale 1920px domyślnie, high-res tylko przy zoom >1.5×
- `index.html` — CSP: +`onda:` w `default-src` i `img-src`
- `projekt2.md` — dokumentacja

**Zależności:**
- `sharp@0.35.3` + `@img/sharp-win32-x64@0.35.3` (N-API, nie wymaga rebuild)

### 15.6 Mierniki sukcesu

| Metryka | Przed | Runda 2 | Runda 3 (Sharp + downscale) |
| ------- | ----- | ------- | --------------------------- |
| Zoom latency (20MB photo) | ~500ms | <16ms (60fps) | <16ms + 200ms do full-res przy >1.5× |
| Thumbnail load (1st) | ~300ms | ~20ms (cache) | ~5ms (Windows thumbcache) lub ~20ms (Sharp) |
| Batch 5000 thumbnaili | godziny | — | ~2-5 min (Sharp concurrency) |
| Pierwsze ładowanie 20MB | 500ms IPC | 100ms WIC | 50ms (downscale 1920px) |
| Zużycie RAM na viewer | 80MB+ | ~30MB | ~5MB (1920px downscale) |
| Bezpieczeństwo | — | ⚠️ | ✅ |

### 15.7 Statystyki (po sprincie 7)

| Metryka | Wartość |
| ------- | ------- |
| typecheck | 0 błędów |
| build | OK |
| Nowe IPC | 2 (`media:getThumbnail` z Windows thumbcache + Sharp, `media:batchThumbnails`) |
| Nowe pliki | 1 (`src/main/utils/sharp.ts`) |
| Pliki modyfikowane | 6 (index.ts, handlers.ts, ImageViewer.vue, index.html, main.css, sharp.ts) |
| Nowe zależności | `sharp@0.35.3`, `@img/sharp-win32-x64@0.35.3` |
| CSS vars | `onda:` added to CSP img-src and default-src |
| Główna zmiana | `file://` → `onda://` custom protocol. Obrazki domyślnie 1920px. Sharp zamiast nativeImage. Windows thumbcache first. |

