# Onda — Projekt 2.0: Diagnoza, Optymalizacja i Rozbudowa

## 1. Stan Obecny (po Phase 4)

### 1.1 Statystyki kodu

| Metryka | Wartość |
|---------|---------|
| Pliki źródłowe | 88 (45 `.ts` + 39 `.vue` + 3 `.d.ts` + 1 `.css`) |
| Linie kodu | ~8,700 |
| Pliki testowe | 2 (34 testy) |
| Zależności npm | 36 (14 runtime + 22 dev) |
| TODO/FIXME w kodzie | 1 |
| `typecheck` | 100% clean |
| `build` | OK |
| `test` | 34/34 passed |

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

| ID | Problem | Plik | Priority |
|----|---------|------|----------|
| P2.4 | Brak wirtualizacji dla długich list | LibraryView, ExplorerView | Wysoki |
| P2.5 | `reactive(Map)` coverCache — ograniczona reaktywność | stores/player.ts | Średni |
| P2.8 | Lazy loading Lucide ikon w komponentach | SettingsView + inne | Niski |
| P2.10 | `encodeURI()` brak dla ścieżek z `#`, `?` | audioEngine.ts | Niski (rzadkie) |
| P3.8 | `createMediaElementSource` może crashować przy reuse | audioEngine.ts | Średni |
| P4.5 | DI (dependency injection) — trudne mockowanie | Wszystkie moduły | Niski |
| P4.8 | Puste `init()` w modułach — boilerplate | ExplorerModule itp. | Niski |
| P5.1 | Tylko 2 pliki testowe — małe pokrycie | — | Średni |
| P5.2 | `any` w `lfa-ponyfill` i JASSUB (brak typów) | — | Niski |
| P5.3 | Polskie stringi UI (brak i18n) | Wszystkie .vue | Niski |
| P5.6 | Logger istnieje, ale nie wszędzie używany | Kilka plików | Niski |
| P5.7 | ESLint no-explicit-any = warn (docelowo error) | eslint.config.mjs | Niski |
| P6.2 | yt:* placeholdery (nadal nie zaimplementowane) | handlers.ts | Średni |
| P6.3 | update:* placeholdery | handlers.ts | Niski |
| P6.4 | SettingsNetwork, SettingsApiKeys — UI bez backendu | components/settings/ | Niski |
| P6.5 | SettingsShortcuts — tylko wyświetla, nie edytuje | components/settings/ | Niski |
| P6.6 | pip.html/pip.ts — osobny bundle, nie wiadomo czy używany | — | Niski |

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
| Zakladka | Zawartosc |
|----------|-----------|
| Utwory | Wszystkie audio tracks z wirtualizacja + wyszukiwarka |
| Video | Wszystkie video tracks z wirtualizacja + wyszukiwarka |
| Foldery | Drzewiasta struktura folderow z wykrytym typem (ikona) |
| Artyści | Grupowanie po artist (tylko audio) |
| Albumy | Siatka albumow z cover art (tylko audio) |
| Playlisty | Lista playlist + podglad zawartosci po kliknieciu |

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

| Optymalizacja | Czas | Zysk | Pliki |
|--------------|------|------|-------|
| `reactive(Map)` → `ref<Record>` dla coverCache | 30min | Poprawa reaktywności okładek | `stores/player.ts` |
| Wirtualizacja LibraryView | 2h | Płynne scroll 10k+ utworów | `LibraryView.vue` |
| `encodeURI()` dla ścieżek | 15min | Obsługa specjalnych znaków | `audioEngine.ts` |
| Lazy loading Lucide | 1h | Mniejszy bundle JS | `SettingsView.vue` + inne |
| i18n setup (vue-i18n) | 3h | Gotowość pod tłumaczenia | Nowy plik + zmiany w .vue |

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
  'settings:get': { args: []; result: Partial<AppSettings> }
  'settings:set': { args: [data: Partial<AppSettings>]; result: boolean }
  // ... każdy kanał ma args i result
}

type IpcInvoke = <C extends keyof IpcChannels>(
  channel: C, ...args: IpcChannels[C]['args']
) => Promise<IpcChannels[C]['result']>
```

### 5.4 Brak cache offline
**Problem:** Google Fonts fallback (`lfa-ponyfill`) wymaga internetu. Bez niego napisy używają tylko lokalnych fontów.

**Rozwiązanie:** Cache fontów na dysku (electron-store + baza fontów)

---

## 6. Mierniki Jakości

| Obszar | Obecnie | Cel (Q3 2026) | Cel (Q1 2027) |
|--------|---------|---------------|---------------|
| typecheck | 0 błędów | 0 błędów | 0 błędów |
| lint errors | 26 (CRLF) | 0 | 0 |
| Testy | 34 (2 pliki) | 200+ (15 plików) | 500+ (30 plików) |
| Code coverage | 0% | >30% | >60% |
| Liczba `any` | 7 (warn) | 0 | 0 |
| TODO w kodzie | 1 | 0 | 0 |
| Console.error w renderer | 0 (logger) | 0 | 0 |
| Bundle size (renderer) | ~448 KB JS + ~2 MB WASM | <400 KB JS | <350 KB JS |

---

## 7. Zależności do dodania

| Pakiet | Faza | Cel |
|--------|------|-----|
| `@vueuse/electron` | 5 | IPC wrappers |
| `better-sqlite3` | 6 | Local DB dla biblioteki |
| `vue-i18n` | 9 | Internacjonalizacja |
| `@vueuse/motion` | 9 | Animacje |
| `pinia-colada` | 7 | Async state management |
| `playwright` | 7 | E2E tests |
| `@vitest/coverage-v8` | 7 | Code coverage |

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

| # | Problem | Rozwiązanie | Pliki |
|---|---------|-------------|-------|
| 1 | **Freeze przy starcie** — biblioteka ładuje się synchronicznie, blokuje main process | Splash zamyka się natychmiast (bez czekania na bibliotekę). `loadFromDisk()` dzieli na fazy: playlists/foldery (eager) → tracks (przez `requestIdleCallback` z timeoutem 3s). Cover loading batchowany po 5 IPC na ramkę. | `index.ts`, `App.vue`, `library.ts`, `player.ts` |
| 2 | **Cover loading flood** — 500 IPC invoke jednocześnie przy starcie | `player.loadCover()` wkłada do kolejki (`coverQueue: string[]`), flush po 5 przez `requestIdleCallback`. Usunięto `loadCoversForTracks` z `library.ts`. `LibraryTrackRow` nie woła `loadCover` w `onMounted`. | `player.ts`, `library.ts`, `LibraryTrackRow.vue` |
| 3 | **Video nie nawiguje za drugim razem** | Usunięto `lastTrackType` guard w watcherze App.vue — zawsze nawiguje do `/player` gdy `currentTrack.type === 'video'`. | `App.vue` |
| 4 | **Folder file count = 0** dla głęboko zagnieżdżonych | `getTracksInDir` zwraca wszystkie pliki rekurencyjnie (przez `startsWith`). Nowa `getDirectTracksInDir` dla listowania. Nowy komponent `DirNode.vue` z rekurencyjną strukturą. | `DirNode.vue`, `LibraryView.vue` |
| 5 | **Czyszczenie kolejki przed odtworzeniem** | `playTracks()` → `clearQueue()` + `addToQueueMultiple` + `setTrack` + `play()`. Dotyczy folderów, playlist, artistów, albumów. | `LibraryView.vue`, `Sidebar.vue` |
| 6 | **Playlisty nie widoczne od razu** | `library.loadFromDisk()` wołane w `App.vue.onMounted` (nie dopiero w LibraryModule). | `App.vue` |
| 7 | **Brak okładek wideo** | `<video>` dla coverów typu `'video'` z `autoplay muted loop`. Kafelki w LibraryView też pokazują cover. | `LibraryTrackRow.vue`, `LibraryView.vue` |
| 8 | **Loading state w HomeView** | Skeleton placeholders podczas `isLoading` / `!isLoaded`. | `HomeView.vue` |

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

| Plik | Opis |
|------|------|
| `src/renderer/src/components/library/DirNode.vue` | Rekurencyjny komponent folder tree |

### 9.4 Statystyki (po sprincie)

| Metryka | Przed | Po |
|---------|-------|----|
| typecheck | 0 błędów | 0 błędów |
| lint errors | 0 | 0 |
| test | 34/34 | 34/34 |
| Nowe pliki | — | 1 |
| Pliki źródłowe | 87 | 88 |
| TODO/FIXME | 1 | 1 |

*Ostatnia aktualizacja: 2026-07-21*
