# Onda — Projekt 2.0: Diagnoza, Optymalizacja i Rozbudowa

## 1. Stan Obecny (po Phase 4)

### 1.1 Statystyki kodu

| Metryka             | Wartość                                          |
| ------------------- | ------------------------------------------------ |
| Pliki źródłowe      | 95 (46 `.ts` + 44 `.vue` + 3 `.d.ts` + 1 `.css`) |
| Linie kodu          | ~11,800                                          |
| Pliki testowe       | 2 (34 testy)                                     |
| Zależności npm      | 36 (14 runtime + 22 dev)                         |
| TODO/FIXME w kodzie | 1                                                |
| `typecheck`         | 100% clean                                       |
| `build`             | OK                                               |
| `test`              | 34/34 passed                                     |

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

| ID    | Problem                                                  | Plik                      | Priority        |
| ----- | -------------------------------------------------------- | ------------------------- | --------------- |
| P2.4  | Brak wirtualizacji dla długich list                      | LibraryView, ExplorerView | Wysoki          |
| P2.5  | `reactive(Map)` coverCache — ograniczona reaktywność     | stores/player.ts          | Średni          |
| P2.8  | Lazy loading Lucide ikon w komponentach                  | SettingsView + inne       | Niski           |
| P2.10 | `encodeURI()` brak dla ścieżek z `#`, `?`                | audioEngine.ts            | Niski (rzadkie) |
| P3.8  | `createMediaElementSource` może crashować przy reuse     | audioEngine.ts            | Średni          |
| P4.5  | DI (dependency injection) — trudne mockowanie            | Wszystkie moduły          | Niski           |
| P4.8  | Puste `init()` w modułach — boilerplate                  | ExplorerModule itp.       | Niski           |
| P5.1  | Tylko 2 pliki testowe — małe pokrycie                    | —                         | Średni          |
| P5.2  | `any` w `lfa-ponyfill` i JASSUB (brak typów)             | —                         | Niski           |
| P5.3  | Polskie stringi UI (brak i18n)                           | Wszystkie .vue            | Niski           |
| P5.6  | Logger istnieje, ale nie wszędzie używany                | Kilka plików              | Niski           |
| P5.7  | ESLint no-explicit-any = warn (docelowo error)           | eslint.config.mjs         | Niski           |
| P6.2  | yt:* placeholdery (nadal nie zaimplementowane)           | handlers.ts               | Średni          |
| P6.3  | update:* placeholdery                                    | handlers.ts               | Niski           |
| P6.4  | SettingsNetwork, SettingsApiKeys — UI bez backendu       | components/settings/      | Niski           |
| P6.5  | SettingsShortcuts — tylko wyświetla, nie edytuje         | components/settings/      | Niski           |
| P6.6  | pip.html/pip.ts — osobny bundle, nie wiadomo czy używany | —                         | Niski           |

---

## 2. Architektura (aktualna)

```
┌──────────────────────────────────────────┐
│              MAIN PROCESS                 │
│  index.ts (321)                           │
│  ├── createWindow() → BrowserWindow       │
│  ├── Tray icon + global shortcuts         │
│  ├── Splash screen                        │
│  ├── pip-manager.ts (368)                 │
│  │   └── PipManager: PiP + preview window │
│  └── ipc/handlers.ts (707)               │
│      ├── fs:*, media:*, subtitles:*       │
│      ├── settings:*, playback:*, playlist:*│
│      ├── dep:*, shell:*, dialog:*         │
│      ├── yt:*, update:* (placeholdery)    │
│      └── pip:* (10 invoke + 8 send)       │
├──────────────────────────────────────────┤
│              PRELOAD                       │
│  index.ts (126) → contextBridge: window.api│
├──────────────────────────────────────────┤
│              RENDERER                      │
│  main.ts (38) → createApp + Pinia + Router │
│  App.vue (148) → layout + theme + routing  │
│  ├── router/index.ts (113)                │
│  │   └── beforeEach + ModuleManager guard │
│  ├── stores/ (6 store'ów, 895 linii)      │
│  │   ├── player.ts (363) — główny stan    │
│  │   ├── settings.ts (132) — konfiguracja │
│  │   ├── explorer.ts (148)                │
│  │   ├── library.ts (111)                 │
│  │   ├── ui.ts (91)                       │
│  │   └── youtube.ts (50)                  │
│  ├── modules/ (8 modułów, 660 linii)      │
│  │   ├── ModuleManager.ts (83)            │
│  │   ├── audioEngine.ts (424) — klasa     │
│  │   └── PlayerModule/ExplorerModule/...  │
│  ├── composables/ (6, 1028 linii)         │
│  │   ├── useAudioPlayer.ts (138)          │
│  │   ├── useVideoPlayer.ts (311)          │
│  │   ├── useSubtitleRenderer.ts (333)     │
│  │   ├── usePlayerKeyboard.ts (106)       │
│  │   ├── usePiP.ts (81)                   │
│  │   └── useOpenMedia.ts (59)             │
│  ├── views/ (9 widoków, 1596 linii)       │
│  ├── components/ (24, 2546 linii)         │
│  │   ├── layout/ (5) — TitleBar, Sidebar..│
│  │   ├── audio/ (6) — Controls, Visualizer│
│  │   ├── player/ (7) — Queue, OSD, PiP..  │
│  │   └── settings/ (9) — per-zakładka     │
│  └── utils/ (7, 450 linii)                │
│      ├── constants.ts (180) — defaults     │
│      ├── formatters.ts (50)                │
│      ├── fileTypes.ts (46)                 │
│      ├── audioEvents.ts (30) — EventBus    │
│      ├── logger.ts (8)                     │
│      └── ipc.ts (8) — safeInvoke          │
└──────────────────────────────────────────┘
```

---

## 3. Co zrobić — Plan Działania

### Faza 5: YouTube Integration (Priority: WYSOKI)

Implementacja pełnej integracji z YouTube przez yt-dlp.

**Kroki:**

- [ ] **5.1** yt-dlp wrapper w main process — klasa `YtDlpManager` (`src/main/ytdlp.ts`)
  - `search(query)` → JSON results
  - `getInfo(url)` → video metadata
  - `download(url, format, outputPath)` → stream z progressem
  - `getChannel(channelId)` → channel info + video list
- [ ] **5.2** IPC handlers: `yt:search`, `yt:getInfo`, `yt:download`, `yt:getChannel` — z prawdziwą implementacją
- [ ] **5.3** YouTubeView — prawdziwe wyniki, paginacja, odtwarzanie przez yt-dlp + strumień
- [ ] **5.4** Subskrypcje — zapis ulubionych kanałów, auto-pobieranie
- [ ] **5.5** Download manager — progress bar, lista pobrań, wznowienia

**Pliki:** `src/main/ytdlp.ts` (nowy), `handlers.ts`, `YouTubeView.vue`, `youtube.store.ts`

### Faza 6: Library Management — Biblioteka mediow (Priority: WYSOKI)

Pelna biblioteka audio+video z zarzadzaniem folderami, playlistami i metadanymi.

**Zalozenia:**

- Biblioteka skanuje wskazane foldery + podfoldery
- Automatyczna detekcja typu folderu na podstawie proporcji plikow:
  - **Audio folder** — >50% plikow audio LUB wiecej audio niz video
  - **Video folder** — >50% plikow video
  - **Mixed folder** — po 50% (pokazuje zarowno audio jak i video)
- Subfoldery dziedzicza kategorie po rodzicu, ale moga byc przeskalowane
- Obsluga playlist dla audio I video (osobne lub mieszane)

**Zakladki w LibraryView:**

| Zakladka  | Zawartosc                                              |
| --------- | ------------------------------------------------------ |
| Utwory    | Wszystkie audio tracks z wirtualizacja + wyszukiwarka  |
| Video     | Wszystkie video tracks z wirtualizacja + wyszukiwarka  |
| Foldery   | Drzewiasta struktura folderow z wykrytym typem (ikona) |
| Artyści   | Grupowanie po artist (tylko audio)                     |
| Albumy    | Siatka albumow z cover art (tylko audio)               |
| Playlisty | Lista playlist + podglad zawartosci po kliknieciu      |

**Playlisty:**

- Wspolne dla audio i video
- Odtwarzanie: `player.setTrack(playlist.tracks[0])` + laduje cala liste do queue
- Drag & drop tracks do playlisty
- Kontekstowe menu: "Dodaj do playlisty", "Utworz playliste z zaznaczonych"
- Persystencja przez IPC (zapis do electron-store jako JSON)

**Kroki implementacji:**

- [ ] **6.1** IPC handlery: `library:scan`, `library:getAll`, `playlist:*`, `library:folders:*` (handlers.ts)
- [ ] **6.2** library.store — `loadFromDisk()`, `scanFolders()`, `savePlaylists()`, `addFolder()`/`removeFolder()`
- [ ] **6.3** LibraryModule — `activate()` z auto-load + auto-scan
- [ ] **6.4** SettingsLibraryFolders.vue — zarzadzanie folderami + przycisk skanowania
- [ ] **6.5** LibraryPlaylistManager.vue — panel playlist + drag & drop
- [ ] **6.6** LibraryTrackRow.vue — wiersz z akcjami (play, fav, dodaj do playlisty, context menu)
- [ ] **6.7** LibraryView — virtualizacja (@tanstack/vue-virtual), video tab, folder browse, cover art
- [ ] **6.8** Edycja tagow ID3 — jsmediatags zapis
- [ ] **6.9** Automatyczne metadane — MusicBrainz API, Discogs API

**Pliki:** `LibraryView.vue`, `library.store.ts`, `handlers.ts`, `LibraryModule.ts`,  
`SettingsLibraryFolders.vue` (nowy), `LibraryPlaylistManager.vue` (nowy), `LibraryTrackRow.vue` (nowy)

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
| lint errors              | 26 (CRLF)               | 0                | 0                |
| Testy                    | 34 (2 pliki)            | 200+ (15 plików) | 500+ (30 plików) |
| Code coverage            | 0%                      | >30%             | >60%             |
| Liczba `any`             | 7 (warn)                | 0                | 0                |
| TODO w kodzie            | 1                       | 0                | 0                |
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

**Priorytety:**

1. **Faza 5** (YouTube) — największa wartość dla użytkownika
2. **Faza 6** (Library) — core funkcjonalność
3. **Quick wins** (coverCache, virtualizacja, encodeURI) — mały koszt, duży zysk
4. **Faza 7** (Testy) — fundament pod dalszy rozwój
5. **Faza 8** (Performance) — skalowalność dla dużych kolekcji
6. **Faza 9-11** — nowe funkcje i infrastruktura

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

