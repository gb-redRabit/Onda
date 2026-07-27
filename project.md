# Onda — Dokumentacja Projektu

## 1. Przegląd

**Onda** to desktopowy odtwarzacz muzyki i wideo zbudowany na Electron + Vue 3 + TypeScript + Tailwind CSS. Aplikacja obsługuje odtwarzanie lokalnych plików audio/video, eksplorację plików, bibliotekę mediów z metadanymi ID3, equalizer, wizualizację audio, kolejki odtwarzania, napisy wideo, Picture-in-Picture, splash screen z animowaną wizualizacją dźwiękową oraz system motywów.

**Aktualne statystyki (2026-07-26):**

| Metryka | Wartość |
|---------|---------|
| Pliki źródłowe (.ts + .vue + .css + .html) | 132 |
| Linie kodu | ~17,022 |
| Main process | 18 plików, ~2,788 linii |
| Preload | 2 pliki, ~288 linii |
| Shared | 3 pliki, ~191 linii |
| Renderer | 109 plików, ~13,755 linii |
| Pliki testowe | 4 (1,133 linii) |
| Testy | 141 pass |
| Zależności npm | 38 (17 runtime + 21 dev) |
| `typecheck` | 100% clean |
| `build` | OK |
| `lint` | 0 błędów |

**Kluczowe zasady architektury:**

1. Aplikacja jest **modułowa** — każdy główny widok (player, explorer, library, youtube) jest niezależnym modulem z własnym cyklem życia. Centralny **ModuleManager** steruje przełączaniem modułów z obsługą zależności i priorytetów.
2. **Separacja audio/video** — silnik audio (`AudioEngine` class) i wideoplayer (`PlayerView.vue`) mają **niezależny stan czasu/odtwarzania**. Audio działa w tle gdy użytkownik nawiguje do innego widoku. Stan audio jest zarządzany przez `useAudioPlayer` composable (singleton), stan wideo bezpośrednio w `PlayerView.vue`.
3. **Komunikacja przez EventBus** — `audioEngine` → `useAudioPlayer` przez zdarzenia (`audioEvents.ts`), nie callbacki. Luźne sprzężenie między silnikiem audio a warstwą UI.

---

## 2. Stos Technologiczny

| Warstwa        | Technologia                                            |
| -------------- | ------------------------------------------------------ |
| Runtime        | Electron 39.8.10                                       |
| Framework UI   | Vue 3.5.25 (Composition API, `<script setup>`)         |
| Język          | TypeScript 5.9.3                                       |
| Build          | electron-vite 5.0 + Vite 7.2.6                         |
| CSS            | Tailwind CSS 4.3.2 (via `@tailwindcss/vite`)           |
| Stan           | Pinia 3.0.4 + pinia-plugin-persistedstate 4.7.1        |
| Routing        | vue-router 4.6.4 (hash history, lazy loading)          |
| Ikony          | @lucide/vue 1.24.0                                     |
| Virtual Lists  | @tanstack/vue-virtual 3.13.32                          |
| Utilitki       | @vueuse/core 14.3.0                                    |
| Persystencja   | electron-store 11.0.2 (ESM, main process)              |
| Metadane audio | jsmediatags 3.9.7                                      |
| Napisy ASS     | jassub 2.5.7 (wasm + web worker)                       |
| Google Fonts   | lfa-ponyfill 1.1.1                                     |
| Packaging      | electron-builder 26.0.12 (NSIS/DMG/AppImage)           |
| Linting        | ESLint 9.39.1 (flat config) + eslint-plugin-vue 10.6.2 |
| Formatting     | Prettier 3.7.4                                         |

---

## 3. Architektura Modułowa

### 3.1 Koncepcja

Aplikacja składa się z **modułów** — niezależnych funkcjonalności, które mogą być włączane i wyłączane. Każdy moduł:

- Ma własny lifecycle: `init()` → `activate()` → `deactivate()` → `destroy()`
- Rejestruje się w ModuleManagerze przy starcie
- Nie może działać równocześnie z innym modułem tego samego typu
- Musi **całkowicie zwolnić zasoby** (event listenery, timery, audio context, DOM) przed aktywacją następnego modułu

### 3.2 ModuleManager (`src/renderer/src/modules/ModuleManager.ts` — 83 linie)

```typescript
interface AppModule {
  id: string;
  name: string;
  dependencies?: string[]; // Phase 3.7 — IDs wymaganych modułów
  priority?: number; // Phase 3.7 — kolejność initAll (desc)
  init(): void;
  activate(context?: unknown): void;
  deactivate(): Promise<void>;
  destroy(): Promise<void>;
  isActive(): boolean;
}

class ModuleManager {
  private modules = new Map<string, AppModule>();
  private activeModuleId: string | null = null;
  register(module: AppModule): void;
  async switchTo(moduleId: string, context?: unknown): Promise<void>;
  async deactivateAll(): Promise<void>;
  getActive(): AppModule | null;
  get<T extends AppModule>(id: string): T;
  async initAll(): Promise<void>; // sortuje po priority (desc), sprawdza dependencies
}
```

### 3.3 Lista Modułów

| ID         | Moduł          | Plik              | Linii | Opis                   | Zasoby do zwolnienia                                 |
| ---------- | -------------- | ----------------- | ----- | ---------------------- | ---------------------------------------------------- |
| `player`   | PlayerModule   | PlayerModule.ts   | 36    | Odtwarzacz audio/video | AudioContext, RAF loop, audio/video, event listenery |
| `explorer` | ExplorerModule | ExplorerModule.ts | 29    | Eksplorator plików     | IPC listeners, file watchers                         |
| `library`  | LibraryModule  | LibraryModule.ts  | 28    | Biblioteka mediów      | IPC listeners, scan workers                          |
| `youtube`  | YouTubeModule  | YouTubeModule.ts  | 22    | YouTube integration    | IPC listeners, download workers                      |
| `settings` | SettingsModule | SettingsModule.ts | 19    | Ustawienia             | IPC listeners                                        |
| `home`     | HomeModule     | HomeModule.ts     | 19    | Strona główna          | Drop zone listeners                                  |

### 3.4 Przepływ Przełączenia Modułów

```
Użytkownik klika "Eksplorator" w Sidebar
  → router.push('/explorer')
  → router.beforeEach:              // Phase 3.1 — z afterEach na beforeEach
    → sprawdza _isSwitching flagę (recursion guard)
    → oblicza nowy moduł z route name
    → currentActive === 'player' && currentTrack?.type === 'audio'?
      → TAK: activate target module (bez dezaktywacji playera — audio gra w tle)
      → NIE: _pendingSwitch = id → await moduleManager.switchTo('explorer')
        → playerModule.deactivate()    // AWAITS: pauza audio, zapis pozycji, cleanup RAF
        → explorerModule.activate()    // załaduj pliki, pokaż UI
```

### 3.5 Zasada "Audio w Tle"

**Kluczowa zasada:** Muzyka **zawsze** gra w tle gdy użytkownik nawiguje do innego widoku.

- `router.beforeEach` sprawdza (Phase 3.1): jeśli aktywny jest player i currentTrack.type === 'audio', aktywuje docelowy moduł **bez dezaktywacji playera** (z `_isSwitching` / `_pendingSwitch` recursion guard)
- `player.deactivate()` NIE pauzuje audio — jedynie cleanup RAF + AudioContext suspend
- `player.deactivate(force: true)` — pauzuje i czyści (przy zamknięciu app)
- **Widoki NIE wywołują `moduleManager.switchTo()`** — tylko router zarządza modułami
- `PlayerBar widoczny na WSZYSTKICH trasach (oprócz `/player`i`/audio`) gdy currentTrack.type === 'audio'
- AudioView i PlayerBar sa wzajemnie wylaczone — App.vue ukrywa PlayerBar gdy route.name === 'audio'

---

## 4. Struktura Projektu

```
D:\Onda\
├── build/
│   └── entitlements.mac.plist
├── resources/
│   ├── icon.png
│   └── splash.html             # Splash screen (animowana wizualizacja, 131 linia)
├── scripts/
│   ├── install-ytdlp.ps1
│   └── install-ytdlp.sh
├── src/
│   ├── main/                           # === MAIN PROCESS (Node.js) — 18 files, 2,788 lines ===
│   │   ├── index.ts                    # Okno, tray, skróty globalne, PiP, splash screen, media server (434 linie)
│   │   ├── media-server.ts             # Lokalny HTTP server dla mediów (range requests 206) (94 linie)
│   │   ├── pip-manager.ts              # PipManager singleton — PiP + preview + preview window (374 linie)
│   │   ├── ipc/                        # 13 plików, 1,765 linii — podział handlers.ts na dedykowane moduły (17.1)
│   │   │   ├── handlers.ts             # Orkiestrator: rejestruje wszystkie sub-handlery (24 linie)
│   │   │   ├── cover-cache.ts          # Cache okładek + thumbnaili (221 linii)
│   │   │   ├── cover-handlers.ts       # Handler `media:getCover` (13 linii)
│   │   │   ├── dependency-handlers.ts  # FFmpeg, FFprobe, yt-dlp, mkvextract (184 linie)
│   │   │   ├── dialog-handlers.ts      # Dialogi open/save/folder (90 linii)
│   │   │   ├── fs-handlers.ts          # Operacje na plikach: readdir, readFile, writeFile, rename, delete (233 linie)
│   │   │   ├── library-handlers.ts     # Biblioteka: scan, playlisty, tagi (383 linie)
│   │   │   ├── media-handlers.ts       # Metadane, kodeki, transkodowanie (284 linie)
│   │   │   ├── musicbrainz.ts          # MusicBrainz API: search, lookup, cover data (98 linii)
│   │   │   ├── playback-handlers.ts    # Zapamiętywanie pozycji (14 linii)
│   │   │   ├── settings-handlers.ts    # Odczyt/zapis ustawień (23 linie)
│   │   │   ├── subtitle-handlers.ts    # Napisy embedded + zewnętrzne (166 linii)
│   │   │   └── youtube-handlers.ts     # YouTube download (32 linie)
│   │   ├── utils/logger.ts             # Logger (8 linii)
│   │   └── utils/sharp.ts              # SharpService: thumbnail batch, resize, metadata (113 linii)
│   │
│   ├── preload/                        # === PRELOAD BRIDGE — 2 files, 288 lines ===
│   │   ├── index.ts                    # contextBridge: 43 API (window.api) + mediaServerUrl (170 linii)
│   │   └── index.d.ts                  # OndaAPI interface + Window augmentation (118 linii)
│   │
│   └── renderer/                       # === RENDERER PROCESS — 109 files, 13,755 lines ===
│       ├── index.html                  # Main window HTML (17 linii)
│       ├── pip.html                    # PiP window HTML (18 linii)
│       └── src/
│           ├── main.ts                 # createApp + Pinia + Router + i18n (40 linii)
│           ├── App.vue                 # Root layout + ErrorBoundary + toast + context menu (181 linii)
│           ├── env.d.ts                # Vue SFC type declaration + OndaAPI augmentation (54 linie)
│           ├── i18n.ts                 # vue-i18n setup (9 linii)
│           ├── pip.ts                  # PiP bundle entry: JASSUB + IPC listeners (159 linii)
│           ├── vitest.setup.ts         # Vitest setup (15 linii)
│           │
│           ├── modules/                # === MODUŁY — 8 files, 789 lines ===
│           │   ├── ModuleManager.ts    # Singleton: lifecycle, switchTo, initAll (77 linii)
│           │   ├── audioEngine.ts      # Class AudioEngine singleton (561 linii)
│           │   ├── PlayerModule.ts     # Audio engine lifecycle (36 linii)
│           │   ├── ExplorerModule.ts   # File explorer lifecycle (28 linii)
│           │   ├── LibraryModule.ts    # Media library lifecycle + auto-scan (30 linii)
│           │   ├── YouTubeModule.ts    # YouTube integration lifecycle (21 linii)
│           │   ├── HomeModule.ts       # Home page lifecycle (18 linii)
│           │   └── SettingsModule.ts   # Settings lifecycle (18 linii)
│           │
│           ├── router/
│           │   └── index.ts            # 8 tras + beforeEach guard + module switching (107 linii)
│           │
│           ├── stores/                 # === Pinia stores — 6 files + 2 testowe, 1,797 lines ===
│           │   ├── player.ts           # Stan odtwarzacza + kolejka + ulubione + coverCache (449 linii)
│           │   ├── settings.ts         # Ustawienia → electron-store debounced (144 linie)
│           │   ├── explorer.ts         # Stan eksploratora: currentPath, files, streaming batch (176 linii)
│           │   ├── library.ts          # Stan biblioteki + playlisty + foldery (235 linii)
│           │   ├── ui.ts               # Stan UI: sidebar, contextMenu, notifications, toasts (92 linie)
│           │   └── youtube.ts          # Stan YouTube: search, subscriptions, downloads (50 linii)
│           │
│           ├── composables/            # === 8 composables, 1,187 lines ===
│           │   ├── useAudioPlayer.ts    # Singleton: audio state bridge, effectScope(true) (138 linii)
│           │   ├── useVideoPlayer.ts   # Video player: setup, PiP, subtitles, AC3/DTS (368 linii)
│           │   ├── useSubtitleRenderer.ts # JASSUB init + font map + Google fonts (333 linie)
│           │   ├── usePlayerKeyboard.ts # Keyboard shortcuts dla PlayerView (101 linii)
│           │   ├── usePiP.ts            # PiP composable: start, stop, preload, loadTrack (81 linii)
│           │   ├── useOpenMedia.ts      # Open files from filesystem + auto-navigate (59 linii)
│           │   ├── usePromptDialog.ts   # Prompt dialog composable (42 linie)
│           │   └── useThumbnail.ts      # Thumbnail cache + preload (65 linii)
│           │
│           ├── types/
│           │   ├── media.ts            # MediaFile, MediaMetadata (63 linie)
│           │   ├── settings.ts         # AppSettings + ToastSettings (93 linie)
│           │   ├── explorer.ts         # FileItem, ViewMode, ContextMenuItem (28 linii)
│           │   ├── youtube.ts          # YouTubeVideo, Subscription (60 linii)
│           │   ├── subtitles.ts        # MkvFont, SubtitleTrack (15 linii)
│           │   └── lfa-ponyfill.d.ts   # Type declarations for lfa-ponyfill (15 linii)
│           │
│           ├── utils/                  # === 9 files, 742 lines ===
│           │   ├── constants.ts        # Formaty, presety EQ, motywy, defaults, shortcuts (206 linii)
│           │   ├── formatters.ts       # Formatowanie czasu, rozmiaru (52 linie)
│           │   ├── fileTypes.ts        # Rozszerzenia → ikony/kolory (46 linii)
│           │   ├── audioEvents.ts      # EventBus: AudioEventBus (30 linii)
│           │   ├── ipc.ts              # safeInvoke wrapper (22 linie)
│           │   ├── logger.ts           # Logger (8 linii)
│           │   └── thumbLoader.ts      # Thumbnail loader dla ImageViewer (48 linii)
│           │
│           ├── locales/
│           │   ├── en.ts               # Angielskie tłumaczenia (392 linie)
│           │   └── pl.ts               # Polskie tłumaczenia (393 linie)
│           │
│           ├── components/             # === 50 komponentów, ~5,553 linii ===
│           │   ├── layout/             # 4 komponenty, ~727 linii
│           │   │   ├── AppMenu.vue     # Custom titlebar + tabs (146 linii)
│           │   │   ├── Sidebar.vue     # Nawigacja + resize + playlisty + DnD (260 linii)
│           │   │   ├── PlayerBar.vue   # Dolny pasek odtwarzacza (254 linie)
│           │   │   └── StatusBar.vue   # Dolny pasek statusu (67 linii)
│           │   │
│           │   ├── audio/              # 6 komponentów, ~394 linii
│           │   │   ├── AudioControls.vue     # Transport controls + volume (132 linie)
│           │   │   ├── AudioProgressBar.vue  # Seek bar z czasem (55 linii)
│           │   │   ├── AudioLayoutToggle.vue # Przełącznik layoutów (32 linie)
│           │   │   ├── AudioVisualizer.vue   # Canvas visualizer (111 linii)
│           │   │   ├── AudioCover.vue        # Extracted cover art (21 linii)
│           │   │   └── AudioTrackInfo.vue    # Title/artist/album (43 linie)
│           │   │
│           │   ├── player/             # 6 komponentów, ~816 linii
│           │   │   ├── PlayerControls.vue    # Kontrolki: play, skip, speed, filter (280 linii)
│           │   │   ├── PlayerTopBar.vue      # Górny pasek: back, PiP, FS (44 linie)
│           │   │   ├── QueuePanel.vue        # Kolejka + historia + DnD (241 linii)
│           │   │   ├── SubtitleTrackSelector.vue # Wybór ścieżki napisów (86 linii)
│           │   │   ├── ResumePrompt.vue      # Prompt kontynuacji (34 linie)
│           │   │   └── Equalizer.vue         # 10-pasmowy EQ + presety (131 linii)
│           │   │
│           │   ├── explorer/           # 10 komponentów, ~1,087 linii
│           │   │   ├── ExplorerBreadcrumb.vue    # Breadcrumb nawigacja (22 linie)
│           │   │   ├── ExplorerGridItem.vue      # Kafelek grid view (76 linii)
│           │   │   ├── ExplorerNavPane.vue       # Lewy panel nawigacyjny (94 linie)
│           │   │   ├── ExplorerPromptDialog.vue  # Dialog rename/new folder (19 linii)
│           │   │   ├── ExplorerTableRow.vue      # Wiersz list view (61 linii)
│           │   │   ├── ExplorerToolbar.vue       # Górny pasek narzędzi (37 linii)
│           │   │   ├── ExplorerViewModeDropdown.vue # Dropdown trybów widoku (36 linii)
│           │   │   ├── ImageViewer.vue           # Lightbox: HTTP server src, Ken Burns, shuffle (486 linii)
│           │   │   ├── ImageViewerSettings.vue   # Ustawienia slideshow (133 linie)
│           │   │   └── ImageViewerThumbnails.vue # Pasek miniaturek z lazy cache (123 linie)
│           │   │
│           │   ├── library/            # 7 komponentów, ~1,056 linii
│           │   │   ├── LibraryTrackRow.vue   # Wiersz utworu z akcjami (176 linii)
│           │   │   ├── AlbumCard.vue         # Karta albumu z cover art (73 linie)
│           │   │   ├── VideoCard.vue         # Karta video z thumbnail (82 linie)
│           │   │   ├── DirNode.vue           # Rekurencyjny folder tree (101 linii)
│           │   │   ├── LibraryPlaylistManager.vue # Panel playlist (156 linii)
│           │   │   ├── TrackTagEditor.vue    # Edycja tagów ID3 modal (250 linii)
│           │   │   └── MusicBrainzLookup.vue # MusicBrainz search modal (218 linii)
│           │   │
│           │   ├── settings/           # 12 komponentów, ~1,071 linii
│           │   │   ├── SettingsAppearance.vue   # Motyw, akcent, czcionka (178 linii)
│           │   │   ├── SettingsPlayback.vue     # Odtwarzanie: zapamiętywanie, itp (106 linii)
│           │   │   ├── SettingsDependencies.vue # Status zależności + instalacja (144 linie)
│           │   │   ├── SettingsPiP.vue          # PiP: pozycja, rozmiar (142 linie)
│           │   │   ├── SettingsShortcuts.vue    # Skróty klawiszowe — edytowalne (72 linie)
│           │   │   ├── SettingsToast.vue        # Powiadomienia: pozycja, filtry (103 linie)
│           │   │   ├── SettingsLibraryFolders.vue # Zarządzanie folderami biblioteki (105 linii)
│           │   │   ├── SettingsDownload.vue     # Pobieranie: ścieżka, jakość (77 linii)
│           │   │   ├── SettingsNetwork.vue      # Proxy, DNS (32 linie)
│           │   │   ├── SettingsApiKeys.vue      # Klucze API: YouTube, Last.fm (42 linie)
│           │   │   ├── SettingsLanguage.vue     # Wybór języka (37 linii)
│           │   │   └── SettingsUpdates.vue      # Aktualizacje: auto-check (33 linie)
│           │   │
│           │   └── shared/             # 5 komponentów, ~402 linii
│           │       ├── CommandPalette.vue   # Ctrl+K modal search (147 linii)
│           │       ├── ToastNotification.vue # Globalny system toastów (86 linii)
│           │       ├── ErrorBoundary.vue     # Error isolation (33 linie)
│           │       ├── MediaCover.vue        # Cover renderer (video/img/icon) (84 linie)
│           │       └── TrackInfo.vue         # Track info display (52 linie)
│           │
│           ├── views/                  # 8 widoków, ~1,942 linii
│           │   ├── HomeView.vue        # Strona główna + drop zone + skeleton (151 linii)
│           │   ├── PlayerView.vue      # Odtwarzacz video — UI orchestration (280 linii)
│           │   ├── AudioView.vue       # Audio player — 3 layouty + shortcuts (177 linii)
│           │   ├── ExplorerView.vue    # Eksplorator plików (427 linii)
│           │   ├── LibraryView.vue     # Biblioteka mediów (580 linii)
│           │   ├── YouTubeView.vue     # YouTube stub (117 linii)
│           │   ├── DownloadsView.vue   # Pobrania stub (89 linii)
│           │   └── SettingsView.vue    # Ustawienia (121 linii)
│           │
│           ├── assets/
│           │   └── main.css            # Theme CSS variables (94 linie)
│           │
│           └── vitest.setup.ts         # Vitest setup (17 linii)
│
│   └── renderer/
│       ├── public/
│       │   └── fonts/                  # Lokalne fonty Windows (18 plików TTF)
│       │       ├── arial.ttf, arialbd.ttf, ArialBold.ttf, ArialItalic.ttf, ArialBoldItalic.ttf
│       │       ├── Calibri.ttf, CalibriBold.ttf, CalibriItalic.ttf
│       │       ├── CourierNew.ttf, ComicSansMS.ttf, Georgia.ttf
│       │       ├── Tahoma.ttf, TahomaBold.ttf
│       │       ├── SegoeUIEmoji.ttf, TimesNewRoman.ttf
│       │       ├── TrebuchetMS.ttf, TrebuchetMSBold.ttf
│       │       └── Verdana.ttf, VerdanaBold.ttf
│
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json / tsconfig.web.json / tsconfig.node.json
├── eslint.config.mjs
├── .prettierrc.yaml
├── todo.md
├── project.md                          # Ten plik
└── .vscode/
```

---

## 5. Przepływ Danych

### 5.1 Warstwy komunikacji

```
┌─────────────────────────────────────────────────────┐
│                    VIEWS                             │
│  PlayerView / AudioView / ExplorerView / ...        │
│  → czytają store'y (player.currentTrack, etc.)      │
│  → wywołują akcje store (player.setTrack(), etc.)   │
├─────────────────────────────────────────────────────┤
│               PINIA STORES                           │
│  player.ts: currentTrack, isPlaying, queue, ...     │
│  settings.ts: appearance, playback, ...             │
│  explorer.ts: currentPath, files, ...               │
│  → persistencja: electron-store (main process)      │
├─────────────────────────────────────────────────────┤
│             COMPOSABLES                              │
│  useAudioPlayer.ts → singleton: audio state/controls (effectScope(true) + watch()) │
│  useOpenMedia.ts → open files from filesystem       │
│  usePiP.ts → IPC PiP controls                       │
│  useSubtitleRenderer.ts → JASSUB + font map          │
├─────────────────────────────────────────────────────┤
│             MODULES                                  │
│  audioEngine.ts → Web Audio API singleton           │
│  PlayerModule → audio engine lifecycle              │
├─────────────────────────────────────────────────────┤
│             PRELOAD BRIDGE                           │
│  window.api.invoke(channel, ...args)                │
│  → ipcRenderer.invoke → main process                │
├─────────────────────────────────────────────────────┤
│             MAIN PROCESS                             │
│  handlers.ts: fs, media, settings, pip, ...         │
│  pip-manager.ts: PiP window + preview window        │
│  → Node.js fs, child_process (ffmpeg, mkvextract)   │
└─────────────────────────────────────────────────────┘
```

### 5.2 Flow: Odtwarzanie utworu

```
1. Użytkownik: klik "Bounce.mp3" w ExplorerView
2. ExplorerView: player.setTrack(track)
3. Pinia store: currentTrack = track, isPlaying = true, push do history
4. useAudioPlayer effectScope(true) + watch() (currentTrack changed):
   a. track.type === 'audio' → audioEngine.loadTrack(track)
   b. audioEngine: audioEl.src = makeSrc(path)
   c. connectAudio(audioEl) → sourceNode → crossfadeGainA → EQ → gainNode → analyser
   d. setTimeout(100ms): audioEngine.play() (jeśli isPlaying)
5. RAF loop (60fps): audioEngine.onTimeUpdate → useAudioPlayer.currentTime
6. PlayerBar: czyta audio.currentTime/audio.duration → progress bar
7. Gdy audioEl ended:
   a. audioEngine.handleEnded() → sprawdza repeat mode
   b. repeat='one' → restart currentTime=0, play()
   c. crossfade > 0 → startCrossfade(): fade out A, fade in B
   d. otherwise → useAudioPlayer.onTrackEnd → player.nextTrack()
8. player.nextTrack():
   a. repeat='one' → reset currentTime (bez zmiany utworu)
   b. pendingQueue.length > 0 → splice(randomIdx) jeśli shuffle, inaczej shift()
   c. queue.length > 0 → splice(randomIdx) jeśli shuffle, inaczej shift(0)
   d. repeat='all' → weź ostatni z history
   e. otherwise → NO MORE TRACKS
```

### 5.2a Flow: Odtwarzanie wideo

```
1. Użytkownik: klik "Ankha.mp4" → player.setTrack(track)
2. App.vue watch (currentTrack type changed):
   a. video → router.push('/player')
   b. audio → router.push('/audio')
3. PlayerView.setupVideo():
   a. watch(currentTrack) → assigned to local videoRef.src
   b. video.addEventListener('canplay') → video.play() (jeśli isPlaying)
   c. video.addEventListener('timeupdate') → player.currentTime = el.currentTime
   d. video.addEventListener('ended') → sprawdza repeat mode, nextTrack()
4. PlayerView ma WŁASNY stan: currentTime, isPlaying (niezależny od audio)
5. PlayerBar: gdy currentTrack.type === 'video', PlayerBar jest ukryty
```

### 5.3 Flow: Napisy JASSUB (ASS z MKV)

```
1. Użytkownik włącza ścieżkę napisów (embedded ASS lub zewnętrzny .ass/.srt)
2. PlayerView: loadEmbeddedSubtitle(videoPath):
   a. IPC subtitles:extractEmbedded → ASS content
   b. IPC subtitles:extractAttachments → mkvextract wyciąga czcionki:
      - ffprobe: lista streamów attachment (index, filename)
      - mkvextract attachments <attId>:"out.ttf" per-attachment
      - odczyt binarny → { name, ext, data:number[] }[]
   → zwraca { content, format, fonts: MkvFont[] }
3. PlayerView: track.fonts = result.fonts
4. useSubtitleRenderer.loadSubtitleTrack(track):
   a. buildFontMap(assContent, mkvFonts):
      - extractAssFamilies() → rodziny z [V4+ Styles] Fontname
      - dostępne lokalne Windows fonty (availableFonts, lowercase keys)
      - dla brakujących: lfa-ponyfill queryRemoteFonts (Google, postscriptName)
        → URL.createObjectURL(blob) do availableFonts
   b. new JASSUB({
        subContent: assContent,
        workerUrl, wasmUrl (data:application/wasm;base64), modernWasmUrl,
        queryFonts: false,
        fonts: mkvFonts.map(f => new Uint8Array(f.data)),
        availableFonts: fontMap,
        defaultFont: 'arial'
      })
```

**Kluczowe decyzje:**

- `queryFonts: false` — wewnętrzne query JASSUB zepsute w Electron
- wasm ładowany jako `data:` URL (omija błąd MIME na `file://`/`app://`)
- worker przez `?worker&url` (Vite auto-blob, self-contained)
- binarne fonty z MKV → `fonts: Uint8Array[]` (JASSUB sam dopasowuje family name z ASS)
- Google fallback tylko dla nazwanych fontów brakujących lokalnie i w MKV

**Dlaczego edycja stylów ASS nie ma sensu:**

ASS/SSA to złożony format z bogatym systemem stylów. Próba nadpisania stylów psuje wygląd napisów, bo:

1. Oryginalne pliki ASS często mają wiele stylów (nie tylko "Default")
2. Każdy styl może mieć różne czcionki, kolory i pozycjonowanie
3. Nawet proste zmiany (rozmiar czcionki) mogą zmienić układ i czytelność

---

## 6. IPC API (Main ↔ Renderer)

### 6.1 System plików

| Kanał                | Opis                                  |
| -------------------- | ------------------------------------- |
| `fs:getDrives`       | Lista dysków (PowerShell Get-PSDrive) |
| `fs:readdir`         | Zawartość katalogu → FileItem[]       |
| `fs:stat`            | Statystyki pliku (null przy ENOENT)   |
| `fs:readFile`        | Odczyt pliku (Buffer/base64)          |
| `fs:writeFile`       | Zapis pliku                           |
| `fs:scanAudioFolder` | Skan folderu audio                    |

### 6.2 Media

| Kanał                  | Opis                                   |
| ---------------------- | -------------------------------------- |
| `media:getMetadata`    | ID3 metadata (jsmediatags)             |
| `media:getThumbnail`   | Embedded cover art (base64)            |
| `media:getCover`       | Cover: `{ type: 'video'                | 'image' | null, data }` |
| `media:getDuration`    | ffprobe duration (seconds)             |
| `media:getReplayGain`  | ReplayGain tags                        |
| `media:toggleFavorite` | Toggle ulubionego (IPC, legacy)        |
| `media:getFavorites`   | Pobranie mapy ulubionych (IPC, legacy) |

### 6.3 Napisy

| Kanał                          | Opis                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `subtitles:listEmbedded`       | ffprobe: wbudowane ścieżki napisów                          |
| `subtitles:extractEmbedded`    | ffmpeg: ekstrakcja napisów (content + format)               |
| `subtitles:findExternal`       | Szukanie napisów obok pliku                                 |
| `subtitles:readFile`           | Odczyt pliku napisów                                        |
| `subtitles:extractAttachments` | mkvextract: czcionki z MKV → `{name, ext, data:number[]}[]` |

### 6.4 Dialogi

| Kanał               | Opis                  |
| ------------------- | --------------------- |
| `dialog:openFile`   | Dialog otwarcia pliku |
| `dialog:saveFile`   | Dialog zapisu pliku   |
| `dialog:openFolder` | Dialog wyboru folderu |
| `dialog:selectFile` | Zwykły select pliku   |

### 6.5 Picture-in-Picture

**Main process (`pip-manager.ts` — 420 linii):** `PipManager` singleton — zarządza ukrytym `BrowserWindow` (nigdy niszczony, tylko show/hide), preload wideo, synchronizacja czasu, napisy JASSUB.

| Kanał (invoke)       | Opis                                               |
| -------------------- | -------------------------------------------------- |
| `pip:start`          | Pokaż PiP: wyślij wideo + napisy + play + show     |
| `pip:stop`           | Zatrzymaj PiP: wyczyść + ukryj + powiadom renderer |
| `pip:preload`        | Preload: wyślij wideo + napisy, bez play/show      |
| `pip:loadtrack`      | Zmień utwór w PiP: wideo + napisy + play od 0      |
| `pip:updateSubtitle` | Aktualizacja napisów w PiP (bez zmiany wideo)      |
| `pip:previewStart`   | Pokaż okno podglądu PiP (ustawienia)               |
| `pip:previewStop`    | Zamknij okno podglądu PiP                          |
| `pip:previewUpdate`  | Aktualizuj pozycję/rozmiar podglądu na żywo        |

| Kanał (on/send)     | Opis                                           |
| ------------------- | ---------------------------------------------- |
| `pip:videoSrc`      | main→PiP: ustaw src wideo                      |
| `pip:play`          | main→PiP: zacznij odtwarzanie od czasu         |
| `pip:pause`         | main→PiP: pauza (bez czyszczenia wideo)        |
| `pip:clear`         | main→PiP: pauza + usuń src + wyczyść napisy    |
| `pip:subtitle`      | main→PiP: załaduj napisy JASSUB                |
| `pip:clearSubtitle` | main→PiP: usuń napisy                          |
| `pip:requestTime`   | main→PiP: zapytaj o aktualny czas              |
| `pip:timeUpdate`    | PiP→main: aktualny czas odtwarzania            |
| `pip:hidden`        | PiP→main: okno zamknięte przez użytkownika (X) |
| `pip:ended`         | PiP→main/w renderer: wideo się zakończyło      |
| `pip:closed`        | main→renderer: PiP zamknięte + zapisany czas   |

**Renderer (`pip.ts` — 181 linia):** PiP bundle entry — JASSUB init, listenery IPC, close button, progress bar, timestamp display. Osobny HTML (`pip.html`).

**Composable (`usePiP.ts` — 81 linie):** `usePiP({onClosed, onEnded})` — interfejs renderera: `start()`, `stop()`, `preload()`, `loadTrack()`, `loadTrackFromCurrent()`, `updateSubtitle()`.

**Preview window (settings):** Osobny `BrowserWindow` (showPreview/hidePreview/updatePreview) — czarne tło "Podgląd PiP", alwaysOnTop, frameless. Całkowicie niezależny od głównego PiP.

### 6.6 Ustawienia / Odtwarzanie / Playlista

| Kanał                                                   | Opis                  |
| ------------------------------------------------------- | --------------------- |
| `settings:get` / `settings:set`                         | Odczyt/zapis ustawień |
| `playback:setPosition` / `playback:clearPosition`       | Pozycja odtwarzania   |
| `playlist:list` / `playlist:create` / `playlist:delete` | CRUD playlist         |
| `playlist:addTrack` / `playlist:removeTrack`            | Zarządzanie utworami  |

### 6.7 Okno / Shell / FFmpeg / Zależności

| Kanał                                           | Opis                                             |
| ----------------------------------------------- | ------------------------------------------------ |
| `window:createChild` / `window:closeChild`      | Okna podrzędne                                   |
| `window:maximized`                              | main→renderer: stan okna (maximize/unmaximize)   |
| `shell:openExternal` / `shell:showItemInFolder` | Otwieranie w systemie                            |
| `dep:checkFfmpeg`                               | Sprawdzenie FFmpeg (cache w electron-store)      |
| `dep:checkFfprobe`                              | Sprawdzenie FFprobe                              |
| `dep:checkYtdlp`                                | Sprawdzenie yt-dlp                               |
| `dep:checkMkvextract`                           | Sprawdzenie MKVToolbox (mkvextract)              |
| `dep:installMkvextract`                         | Instalacja MKVToolbox (choco install mkvtoolnix) |
| `dep:installFfmpeg`                             | Instalacja FFmpeg (choco)                        |
| `dep:installYtdlp`                              | Instalacja yt-dlp (GitHub Releases binary)       |
| `webUtils:getFilePath`                          | Ścieżka pliku z drag&drop (webUtils)             |

---

## 7. Pinia Stores

### 7.1 `player.ts` (490 linii) — Odtwarzacz

**Stan (ref):**

- `currentTrack: MediaFile | null`
- `queue: MediaFile[]` (max ~100)
- `pendingQueue: MediaFile[]` — tymczasowa kolejka (tracki dodane przez openMediaFiles, przed wyczerpaniem)
- `history: MediaFile[]` (max 100)
- `isPlaying: boolean`
- `isMuted: boolean`
- `volume: number` (0-1, default 0.8)
- `currentTime: number` — synchronizowany z RAF loop (audio) lub video timeupdate
- `duration: number`
- `playbackRate: number`
- `shuffle: boolean`
- `repeat: 'none' | 'all' | 'one'`
- `crossfadeDuration: number`
- `queueVisible / equalizerVisible` — UI toggles
- `equalizerBands: number[10]`
- `equalizerPreset: string`
- `pipActive / pipTime`
- `coverCache: Map<string, CoverResult>` (reactive Vue 3 Map)
- `subtitleTracks: SubtitleTrack[]`
- `activeSubtitleId: string | null`
- `resumePrompt: { path, position } | null`
- `favorites: Set<string>` — ulubione ścieżki (zapisywane do electron-store jako array)

**Computed:** `hasTrack`, `progress`, `queueLength`, `displayQueue` (= pendingQueue + queue)

**Akcje:**

- **Odtwarzanie:** `setTrack`, `play`, `pause`, `togglePlay`, `seek`
- **Głośność:** `setVolume`, `toggleMute`
- **Tryby:** `toggleShuffle`, `cycleRepeat`
- **Kolejka:** `addToQueue`, `addToQueueMultiple`, `removeFromQueue`, `clearQueue`, `flushPendingQueue`, `reorderQueue`, `insertInQueue`
- **Nawigacja:** `nextTrack` (z random index przy shuffle), `prevTrack`, `playFromHistory`
- **UI toggles:** `toggleQueue`, `toggleEqualizer`
- **Okładki:** `loadCover`, `getCover`, `enrichTrack`
- **Ulubione:** `toggleFavorite(path)`, `isFavorite(path)` — persistencja w electron-store
- **Napisy:** `loadSubtitles`, `loadEmbeddedSubtitle`, `setActiveSubtitle`, `clearSubtitles`
- **Prompt:** `showResumePrompt`, `clearResumePrompt`

**Logika nextTrack (shuffle):**

- `pendingQueue.length > 0`: losuje random index (shuffle=ON) lub bierze pierwszy (shuffle=OFF), usuwa z kolejki
- `queue.length > 0`: j.w.
- `repeat='all'`: bierze ostatni z history
- `repeat='one'`: resetuje currentTime bez zmiany utworu

**Persistencja:** Volume, shuffle, repeat, EQ bands → `settings.store` (auto-save)

### 7.2 `settings.ts` (159 linii) — Ustawienia

**Sekcje:** `appearance`, `playback`, `download`, `shortcuts`, `dependencies`

**Playback settings:**

- `playbackSpeed` — 0.2–3.0, default 1.0
- `videoFilter` — CSS filter na `<video>` (none, grayscale, sepia, contrast, brightness, saturate, invert, blur, hue-rotate)
- `cursorHide` — ukrywanie kursora w fullscreen (default true)
- `cursorTimeout` — czas do ukrycia kursora w sekundach (default 3)
- `pipPosition` — pozycja okna PiP (bottom-right, bottom-left, top-right, top-left)
- `pipWidth` / `pipHeight` — rozmiar okna PiP (default 480×290)

**Zachowanie:** `playbackSpeed` i `videoFilter` resetują się do defaultów przy każdej zmianie utworu.

**Persistencja:** Cały obiekt → electron-store w main process (przez IPC `settings:get/set`)

### 7.3 `explorer.ts` (196 linii) — Eksplorator

**State:** `currentPath`, `files: FileItem[]`, `selectedFiles: Set`, `viewMode`, `sortBy/sortOrder`, `history[]`, `isLoading`, `error`, `dirTree`, `batchIndex`, `totalFiles`

**Akcje:** `navigateTo(path)`, `navigateUp()`, `goBack/Forward`, `refresh`, `setViewMode`, `setSort`, `toggleSelect`, `selectAll`, `clearSelection`, `batchPush(files)`, `batchReset()`

### 7.4 `library.ts` (259 linii) — Biblioteka

**State:** `tracks: MediaFile[]`, `playlists: Playlist[]`, `libraryFolders: string[]`, `isScanning`, `searchQuery`, `viewMode` (list/cover), `sortBy`, `filter`

**Computed:** `artists`, `albums`, `recentTracks`, `mostPlayed`, `filteredTracks`, `artistList`, `albumList`

**Akcje:** `addFolder/removeFolder`, `scanFolders`, `addToPlaylist`, `removeFromPlaylist`, `createPlaylist/deletePlaylist`, `renamePlaylist`, `importFileToLibrary`, `search`, `sort`, `deleteTrack`, `getAlbumTracks`, `loadPlaylists`

### 7.5 `ui.ts` (103 linie) — UI State

**State:** `sidebarExpanded/Width/Mode`, `statusBarVisible`, `playerBarVisible`, `contextMenu`, `toasts: Toast[]`, `notifications`, `confirmDialog`

**Akcje:** `showToast`, `dismissToast`, `showContextMenu`, `hideContextMenu`, `showConfirm/resolveConfirm`

### 7.6 `youtube.ts` (58 linii) — YouTube (stub)

**State:** `searchResults`, `subscriptions`, `downloads`

---

## 8. Web Audio API — Architektura Dźwięku

### 8.1 Łańcuch sygnałowy

```
audioEl ──→ sourceNode ──→ crossfadeGainA ──→ [EQ: BiquadFilter ×10] ──→ gainNode ──→ analyserNode ──→ destination
nextAudioEl ──→ sourceNodeB ──→ crossfadeGainB ─┘
```

### 8.2 Klasa AudioEngine (`audioEngine.ts` — 631 linii, Phase 3.3)

**Phase 3.3:** Przeniesiono z 15+ module-level `let` zmiennych na klasę `AudioEngine` z private fields.

```typescript
class AudioEngine {
  private audioEl: HTMLAudioElement | null = null
  private nextAudioEl: HTMLAudioElement | null = null
  private audioCtx: AudioContext | null = null
  private sourceNode: MediaElementAudioSourceNode | null = null
  private sourceNodeB: MediaElementAudioSourceNode | null = null
  private crossfadeGainA: GainNode | null = null
  private crossfadeGainB: GainNode | null = null
  private eqFilters: BiquadFilterNode[] = []
  private gainNode: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private rafId: number | null = null
  private crossfadeTimer: ... | null = null
  private isCrossfading = false

  private onTimeUpdate: ((time: number) => void) | null = null
  private onDurationChange: ((dur: number) => void) | null = null
  private onPlayStateChange: ((playing: boolean) => void) | null = null
  private onTrackEnd: (() => void) | null = null
}

export const audioEngine = new AudioEngine()  // singleton
```

### 8.3 Gapless Playback

```
1. ensureNextPreloaded(): nextAudioEl.src = następny utwór
2. current ended → handleEnded()
3. repeat='one' → audioEl.currentTime = 0; audioEl.play(); return
4. startGapless(): sprawdza nextAudioEl.readyState
   a. readyState >= 3 → swap() natychmiast
   b. readyState < 3 → czekaj na 'canplay' event → swap()
5. swap():
   a. audioEl.pause(), audioEl.removeAttribute('src')
   b. player.removeFromQueue(0), player.setTrack(nextTrack)
   c. audioEl = nextAudioEl, nextAudioEl = null
   d. sourceNode = sourceNodeB, sourceNodeB = null
   e. crossfadeGainA.gain = 0, crossfadeGainB.gain = 1
   f. audioEl.play()
   g. ensureNextPreloaded() → następny z queue
```

### 8.3a EventBus (audioEngine → useAudioPlayer, Phase 3.2)

**Phase 3.2:** Callbacki zastąpione EventBus (`utils/audioEvents.ts` — 30 linii). `AudioEngine` emituje zdarzenia, `useAudioPlayer` subskrybuje przez `audioEvents.on()`. Luźniejsze sprzężenie — brak bezpośrednich referencji między silnikiem a store.

```typescript
class AudioEventBus {
  private handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
  emit(event: string, ...args: unknown[]): void;
}

export const audioEvents = new AudioEventBus();

// Zdarzenia:
// timeUpdate(time)       → useAudioPlayer.currentTime.value = time
// durationChange(dur)    → useAudioPlayer.duration.value = dur
// playStateChange(bool)  → useAudioPlayer.isPlaying.value = playing
// trackEnd()             → player.nextTrack()
// trackLoaded()          → player.setTrack() po loadTrack
```

Dlaczego EventBus zamiast callbacków:

- audioEngine NIE pisze bezpośrednio do player store (izolacja)
- useAudioPlayer subskrybuje zdarzenia zamiast ustawiać callbacki
- Wiele subskrybentów może nasłuchiwać (future-proof)
- Łatwiejsze testowanie i mockowanie
- PlayerView (video) ma WŁASNY niezależny element `<video>`

### 8.4 Crossfade

```
1. nextAudioEl.src = następny utwór
2. Czekaj na 'canplay'
3. crossfadeGainA.gain.setValueAtTime(1).linearRampToValueAtTime(0, currentTime + duration)
4. crossfadeGainB.gain.setValueAtTime(0).linearRampToValueAtTime(1, currentTime + duration)
5. nextAudioEl.play()
6. Po duration*1000ms → swap() jak w gapless
```

### 8.5 Remember Position

```
savedPositions = Map<string, { time: number; savedAt: number }>
loadTrack(): sprawdza savedPositions + retentionMinutes → seek do zapisanego czasu
savePosition(): zapisuje currentTime do Map + IPC playback:setPosition
clearSavedPosition(): usuwa z Map + IPC playback:clearPosition
```

### 8.6 ReplayGain

```
enrichTrack() → IPC media:getReplayGain → track.metadata.replayGain
loadTrack() → applyReplayGain(): gainDb → linear → gainNode.gain.value
```

---

## 9. Trasy

| Path         | Nazwa     | Widok         | Moduł               |
| ------------ | --------- | ------------- | ------------------- |
| `/`          | home      | HomeView      | home                |
| `/player`    | player    | PlayerView    | player              |
| `/audio`     | audio     | AudioView     | player              |
| `/explorer`  | explorer  | ExplorerView  | explorer            |
| `/library`   | library   | LibraryView   | library             |
| `/youtube`   | youtube   | YouTubeView   | youtube             |
| `/downloads` | downloads | DownloadsView | youtube (downloads) |
| `/search`    | search    | SearchView    | home                |
| `/settings`  | settings  | SettingsView  | settings            |

Lazy loading: `() => import(...)` w routerze (113 linii). Transition fade (`opacity 0.12s`) między widokami.

**Nawigacja auto:** `App.vue` watch na `player.currentTrack` automatycznie przełącza do `/player` gdy typ zmienia się na video. Audio pozostaje w bieżącym widoku (gra w tle).

**beforeEach guard (Phase 3.1):** Router używa `beforeEach` zamiast `afterEach`, z `await moduleManager.switchTo(moduleId)` i recursion guard (`_isSwitching` / `_pendingSwitch`). Gdy aktywny jest player (audio) i nawiguje się do innego widoku, aktywuje docelowy moduł BEZ dezaktywacji playera — audio kontynuuje odtwarzanie w tle. Guard zapobiega rekurencji przy switchTo wywołanym z routera.

---

## 10. Formaty Plików

| Typ       | Rozszerzenia                                                              |
| --------- | ------------------------------------------------------------------------- |
| Audio     | `.mp3` `.flac` `.wav` `.ogg` `.aac` `.m4a` `.wma` `.opus` `.aiff` `.alac` |
| Video     | `.mp4` `.mkv` `.avi` `.webm` `.mov` `.wmv` `.flv` `.m4v` `.ts` `.ogv`     |
| Playlista | `.m3u` `.m3u8` `.pls` `.asx`                                              |
| Napisy    | `.srt` `.vtt` `.ass` `.ssa` `.sub`                                        |

---

## 11. Fazy Rozwoju

### FAZA 0: Fundament i Architektura — ✅ UKOŃCZONA

- [x] Instalacja zależności
- [x] Struktura katalogów
- [x] Preload bridge (126 linii, pełny type safety)
- [x] Main process + IPC handlers (269 + 718 linii)
- [x] Router z lazy loading (98 linii)
- [x] **Architektura modułowa** — ModuleManager + 6 modułów
- [x] **audioEngine.ts** — wyodrębniony silnik audio (447 linii)
- [x] **useAudioPlayer.ts** — singleton audio state bridge z effectScope(true) + watch() (134 linie)
- [x] Router `afterEach` guard → smart path: audio w tle bez dezaktywacji playera
- [x] **Splash screen** — `resources/splash.html` (standalone HTML, inline CSS, animowana wizualizacja dźwiękowa na canvas) + `createSplashWindow()` / `checkAndShow()` / `forceCloseSplash()` w `index.ts`

### FAZA 1: UI Skeleton + Nawigacja — ✅ UKOŃCZONA

- [x] Custom TitleBar (tabs, drag, context menu) — 253 linie
- [x] TopMenu + TopBar — 117 linii
- [x] Sidebar (resize, collapse, playlisty, drag & drop) — 196 linii
- [x] PlayerBar (okładka video/img/icon, controls, progress, volume, mini player, Heart favorite, Disc3 audio nav) — 276 linii
- [x] StatusBar — 63 linie
- [x] System motywów (dark, light, midnight, spotify) + dynamiczne CSS variables
- [x] Context menu globalny (App.vue)
- [x] Router + widoki (9 tras) + transitions

### FAZA 2: Odtwarzacz Multimediów — ✅ ~98% UKOŃCZONA

**Ukończono:**

- [x] Silnik audio: HTML5 Audio + Web Audio API (audioEngine.ts — 447 linii)
- [x] **Separacja audio/video** — audioEngine z callback system, useAudioPlayer z effectScope(true) + watch()
- [x] **Audio w tle** — nawigacja do innego widoku NIE pauzuje audio, PlayerBar widoczny zawsze
- [x] **Video→audio transition** — audioEngine.resume() przywraca RAF loop + AudioContext
- [x] Gapless playback (preload + swap)
- [x] Crossfade (GainNode fade)
- [x] 10-pasmowy equalizer + presety + custom presets (Equalizer.vue — 129 linii)
- [x] Wizualizacja (bars, wave, radial) — Canvas + AnalyserNode (AudioVisualizer.vue — 110 linii)
- [x] Kolejka + historia z drag-and-drop (QueuePanel.vue — 276 linii)
- [x] Media Session API + Tray icon + Global shortcuts
- [x] Drag & Drop z systemu (Electron webUtils.getPathForFile)
- [x] **Okładki w PlayerBar** — video (muted loop), image, icon fallback (tak jak QueuePanel)
- [x] Zapamiętywanie pozycji (audio/wideo, konfigurowalny czas)
- [x] ReplayGain / Normalization
- [x] Favorites + Playlists (IPC + electron-store)
- [x] **Wideo player** (fullscreen, PiP z pollingiem 250ms) — useVideoPlayer composable (304 linii) + PlayerView (357 linii)
- [x] **AudioView** — 3 layouty (split/full/stacked), controls, progress bar, shortcuts, auto-hide UI, toggle EQ/Kolejka (165 linii), sub-components (AudioCover, AudioTrackInfo)
- [x] **Favorites** — heart button PlayerBar + AudioView, persistencja electron-store, keyboard shortcut F
- [x] Napisy (SRT/VTT/ASS parser)
- [x] Napisy ASS renderowane przez JASSUB (wasm + worker, canvas overlay na video)
- [x] Wyciąganie czcionek z MKV (mkvextract) i podawanie binarnych do JASSUB
- [x] Lokalne fonty Windows (18 fontów w `public/fonts`) jako baza `availableFonts`
- [x] Google Fonts fallback (lfa-ponyfill `queryRemoteFonts`)
- [x] OSD overlay + sterowanie gestami + playback rate (PlayerOSD.vue — 40 linii)
- [x] **Cursor hide w fullscreen** — CSS `.hide-cursor *` z `cursor: none !important`
- [x] **Speed cycling ±** — kroki: 0.2–3.0x. Reset do 1.0x przy nowym utworze
- [x] **Video filters** — dropdown w kontrolierach. CSS filter na `<video>`. Reset do "none"
- [x] **Skip zones** — lewe/prawe 20% okna: hover -10s/+10s. Shift+strzałka = ±30s
- [x] **Keyboard shortcuts** — Spacja/K=play, ←/→=skip, ↑/↓=volume, M=mute, F=fullscreen, `<`/`>`=speed, 0=jump
- [x] **Shuffle z pendingQueue** — losuje random index z pendingQueue (nie tylko z queue)
- [x] **repeat='one' audio** — resetuje currentTime bez tworzenia duplikatów w historii
- [x] **repeat='one' video** — restartuje wideo bezpośrednio (el.currentTime=0; el.play())
- [x] **useOpenMedia** — otwieranie plików z filesystem → auto-nawigacja audio↔video (59 linii)

**Skróty klawiszowe (player):**

| Klawisz            | Akcja                   |
| ------------------ | ----------------------- |
| Spacja / K         | Play / Pause            |
| ←                  | Skip -10s (Shift: -30s) |
| →                  | Skip +10s (Shift: +30s) |
| ↑                  | Głośność +5%            |
| ↓                  | Głośność -5%            |
| M                  | Wycisz                  |
| F                  | Fullscreen              |
| `<`                | Prędkość -0.25x         |
| `>`                | Prędkość +0.25x         |
| 0                  | Skok do 0:00            |
| MediaPlayPause     | Play/Pause (systemowe)  |
| MediaStop          | Stop (systemowe)        |
| MediaNextTrack     | Następny utwór          |
| MediaPreviousTrack | Poprzedni utwór         |

**Pozostało:**

- [ ] **ID3 tags w canvas visualizera** — nałożenie metadanych (tytuł, artysta, album) na canvas AudioVisualizer
- [ ] **Custom presets wizualizacji** — gotowe preset (Neon, Sunset, Monochrome) + zapis własnych (kolory, bar count, smoothing)
- [ ] **Beat detection** — analiza FFT/transjentów → detekcja beatów + BPM estimation + efekty wizualne sync
- [ ] **"Add to Queue" z biblioteki/YouTube** — context menu na utworze w LibraryView + przycisk "Queue" w YouTubeView
- [ ] **Zapis kolejki do M3U** — eksport aktualnej kolejki jako .m3u (dialog:saveFile + generowanie EXTINF)
- [ ] **Optymalizacja cover videos** — lazy loading (IntersectionObserver), limit aktywnych <video>, placeholder gdy hidden

### FAZA 3: YouTube Integration — ❌ NIEZACZĘTA

- [ ] yt-dlp wrapper (main process)
- [ ] Wyszukiwanie
- [ ] Widok kanału + Subskrypcje
- [ ] Download dialog (format, jakość, progress bar)
- [ ] Okładki z YouTube

### FAZA 4: Biblioteka Mediów — ❌ NIEZACZĘTA

- [ ] Skanowanie folderów + odczyt metadanych ID3
- [ ] Baza danych biblioteki (JSON/SQLite)
- [ ] Widoki: wg artysty, albumu, gatunku, roku (siatka + lista)
- [ ] Edycja tagów ID3
- [ ] Automatyczne metadane z MusicBrainz/Discogs

### FAZA 5: Eksplorator Plików — ✅ UKOŃCZONA

- [x] **FileGrid / FileList** — 4 view modes (extraSmall/icons/compact/details) z @tanstack/vue-virtual
- [x] **Navigation Pane** — lewy panel z dyskami + szybki dostęp + foldery biblioteczne (ExplorerNavPane.vue)
- [x] **Command Bar** — górny pasek z widokiem, sortowaniem, nowym folderem (ExplorerToolbar.vue)
- [x] **AddressBar / Breadcrumb** — klikalny breadcrumb: `D:\tapety\Konachan`
- [x] **Menu kontekstowe** — rename, delete, showInFolder, copyPath, openWith, selectAll, new folder
- [x] **ImageViewer** — lightbox-style overlay z zoom/rotate/fullscreen/slideshow (550 linii)
- [x] **Slideshow** — play/pause, interval, loop, 4 tryby przejść (fade/slide/zoom/swirl)
- [x] **Thumbnail strip** — pasek miniaturek z lazy-loading cache (±4 wokół aktualnego)
- [x] **Keyboard shortcuts** — ←/→, +/-, R, F, Space, Esc
- [x] **Virtual scrolling** — `@tanstack/vue-virtual` we wszystkich trybach (overscan: 2)
- [x] **Streaming readdir** — batch push-based IPC (`fs:readdir:batch`, 200/batch)
- [x] **Slideshow settings** — interval, transition type, duration, loop toggle

### FAZA 6: Ustawienia — ✅ CZĘŚCIOWO (refaktor: 731 → 69 linii + 9 komponentów)

- [x] UI shell z sidebar + panels
- [x] Picture-in-Picture (pozycja, rozmiar)
- [x] Zapamiętywanie pozycji (audio/wideo, czas)
- [x] **Zależności** — status check (cache), instalacja FFmpeg, yt-dlp, MKVToolbox
- [x] **PiP preview** — live editing + osobne okno podglądu + auto-close
- [x] **Skróty klawiszowe** — zakładka, podgląd wszystkich skrótów
- [x] **Odtwarzanie** — cursor hide, cursor timeout, prędkość domyślna, filtry wideo
- [ ] Theme: motyw, kolor akcentu, rozmiar czcionki, density, animacje, transparencja
- [ ] Odtwarzanie: crossfade time, normalization, gapless toggle, auto-pause
- [ ] Pobieranie: ścieżka, format, jakość, template nazwy, limit
- [ ] Skróty klawiszowe (edycja click+key combo, eksport/import, reset)
- [ ] Sieć: proxy (HTTP/HTTPS/SOCKS), limit prędkości, DNS cache, User-Agent
- [ ] Klucze API: YouTube Data v3, MusicBrainz, Discogs, Last.fm
- [ ] Aktualizacje: auto-check, harmonogram, changelog, tło

### FAZA 7: Zaawansowane Funkcje — ❌ NIEZACZĘTA

- [ ] Wielo-okienność (osobny eksplorator)
- [ ] Command palette (Ctrl+K)
- [ ] Lista wirtualna (100k+ elementów bez lagów)
- [ ] System wtyczek (manifest, loader, API hooks, store)

### FAZA 8: Integracja z Systemem — ❌ NIEZACZĘTA

- [ ] Auto-update (electron-updater)
- [ ] File associations (.mp3, .flac, .mp4, .mkv, .m3u)
- [ ] Protocol handler (onda:// deep linking)
- [ ] Global shortcuts (rozbudowane, custom combos)

### FAZA 9: Optymalizacja i Wydanie — ❌ NIEZACZĘTA

- [ ] Virtual scrolling dla dużych bibliotek
- [ ] Lazy loading obrazków
- [ ] Worker threads (skanowanie, konwersja audio)
- [ ] Cache miniaturek na dysku
- [ ] Pakowanie (NSIS installer, code signing, notarize)
- [ ] Testy (Vitest unit, Playwright E2E, IPC integration)

---

## 12. Zależności

### 12.1 Runtime

| Pakiet                        | Wersja  | Cel                                                                     |
| ----------------------------- | ------- | ----------------------------------------------------------------------- |
| `vue`                         | 3.5.25  | Framework UI                                                            |
| `vue-router`                  | 4.6.4   | Routing SPA                                                             |
| `pinia`                       | 3.0.4   | Stan globalny                                                           |
| `pinia-plugin-persistedstate` | 4.7.1   | Persistencja store                                                      |
| `@vueuse/core`                | 14.3.0  | Utility composables                                                     |
| `@lucide/vue`                 | 1.24.0  | Ikony SVG                                                               |
| `@tanstack/vue-virtual`       | 3.13.32 | Wirtualne listy                                                         |
| `electron-store`              | 11.0.2  | Persystencja ustawień (main process)                                    |
| `electron-updater`            | 6.3.9   | Auto-aktualizacje                                                       |
| `jsmediatags`                 | 3.9.7   | Odczyt ID3/FLAC/MP4 tags                                                |
| `@types/jsmediatags`          | 3.9.6   | Type definitions                                                        |
| `jassub`                      | 2.5.7   | Renderowanie napisów ASS (wasm + web worker, canvas overlay)            |
| `lfa-ponyfill`                | 1.1.1   | `queryLocalFonts`/`queryRemoteFonts` — Google Fonts fallback w Electron |
| `@electron-toolkit/preload`   | 3.0.2   | Preload utilities                                                       |
| `@electron-toolkit/utils`     | 4.0.0   | Main process utilities                                                  |

### 12.2 Dev

| Pakiet                                     | Wersja        | Cel                  |
| ------------------------------------------ | ------------- | -------------------- |
| `electron`                                 | 39.8.10       | Runtime desktopowy   |
| `electron-vite`                            | 5.0.0         | Build toolchain      |
| `electron-builder`                         | 26.0.12       | Packaging            |
| `vite`                                     | 7.2.6         | Dev server / bundler |
| `@vitejs/plugin-vue`                       | 6.0.2         | Vite Vue plugin      |
| `tailwindcss` + `@tailwindcss/vite`        | 4.3.2         | Utility CSS          |
| `typescript` + `vue-tsc`                   | 5.9.3 / 3.1.6 | Type checking        |
| `eslint`                                   | 9.39.1        | Linting              |
| `eslint-plugin-vue`                        | 10.6.2        | Vue linting          |
| `vue-eslint-parser`                        | 10.2.0        | Vue SFC parser       |
| `@electron-toolkit/eslint-config-ts`       | 3.1.0         | TS ESLint config     |
| `@electron-toolkit/eslint-config-prettier` | 3.0.0         | Prettier compat      |
| `@electron-toolkit/tsconfig`               | 2.0.0         | Shared tsconfig      |
| `prettier`                                 | 3.7.4         | Formatting           |
| `@types/node`                              | 22.19.1       | Node.js types        |

### 12.3 Zewnętrzne (nie-NPM)

| Narzędzie  | Cel                                   | Uwagi                                                                                          |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| FFmpeg     | Transkodowanie, napisy, metadane      | `choco install ffmpeg -y`                                                                      |
| FFprobe    | Probing formatów, duration, cover     | Część FFmpeg                                                                                   |
| MKVToolbox | Wyciąganie czcionek z załączników MKV | `choco install mkvtoolnix -y`; bin: `C:\Program Files\MKVToolNix\mkvextract.exe` (brak w PATH) |
| yt-dlp     | Pobieranie YouTube                    | GitHub Releases binary → `{userData}/bin/yt-dlp.exe`                                           |
| PowerShell | Wykrywanie dysków                     | Tylko Windows                                                                                  |

### 12.4 Zależności Wzajemne (Internal)

```
App.vue (148 linii)
├── settings.load() → settings store → electron-store IPC
├── applyTheme() → constants.ts (THEME_PALETTES)
├── watch(player.currentTrack) → auto-nawigacja do /player przy video
├── PlayerBar visibility — ukryty gdy route.name === 'audio' OR route.name === 'player' (AudioView ma własne controls)
└── IPC listeners (pip:closed, pip:timeupdate)

ModuleManager (69 linii)
├── PlayerModule → audioEngine.ts + player store
├── ExplorerModule → explorer store + IPC fs:*
├── LibraryModule → library store + IPC fs:/media:*
├── YouTubeModule → youtube store
└── HomeModule → player store + IPC dialog:*

audioEngine.ts (631 linii — class AudioEngine singleton)
├── player store (read: currentTrack — only for setupVideoListeners)
├── settings store (playback.crossfadeDuration)
├── Callbacks → useAudioPlayer (onTimeUpdate, onDurationChange, onPlayStateChange, onTrackEnd)
├── resume() → AudioContext.resume() + restart RAF loop (fix video→audio transition)
└── Web Audio API (AudioContext → GainNode → BiquadFilterNode → AnalyserNode)

useAudioPlayer.ts (159 linii — singleton)
├── audioEngine.ts (deleguje play/pause/seek/load, resumeAndPlay)
├── audioEvents.on() — subskrybuje zdarzenia zamiast callbacków (Phase 3.2)
├── effectScope(true) z watch() na player store (currentTrack → loadTrack/pause, isPlaying → play/pause)
├── effectScope(true) z watch() na player.isMuted → audioEngine.setVolume(0 lub volume)
├── effectScope(true) z watch() na player.volume → audioEngine.setVolume(volume)
├── _lastTrackPath dedup, _lastPlaying dedup
└── Vue reaktywność (currentTime, duration, isPlaying, progress, volume)

router/index.ts (117 linii)
├── ROUTE_MODULE_MAP — route name → module ID
├── beforeEach guard (Phase 3.1) — await switchTo, recursion guard, smart path
└── switchTo(moduleId) — standard path for all other navigations

useOpenMedia.ts (72 linie)
├── player store (setTrack, addToQueueMultiple, clearQueue)
├── types (MediaFile, Router)
└── IPC (getDuration, getCover)

useSubtitleRenderer.ts (375 linii)
├── JASSUB init (wasm, worker, fonts)
├── buildFontMap() → lokalne fonty + Google Fonts + MKV binary fonts
└── player store (loadEmbeddedSubtitle)

usePiP.ts (93 linie)
├── IPC pip:* (start, stop, preload, loadTrack, updateSubtitle)
└── callbacks (onClosed, onEnded)

PlayerView.vue (313 linii — Phase 3.4: keyboard extracted)
├── useVideoPlayer composable (setup, PiP, subtitles, watches, lifecycle)
│   ├── videoRef, videoFilterStyle, onVideoRef, togglePiP, init, destroy
│   ├── audioEngine.connectVideoElement / disconnectVideoElement
│   └── useSubtitleRenderer (init, load, remove, destroy, preparePiPSubtitleData)
├── usePlayerKeyboard (Phase 3.4) — extracted keyboard shortcuts
├── usePiP (start, stop, preload, loadTrack)
├── player store (currentTrack, isPlaying, repeat, pipActive, etc.)
├── WŁASNY stan: OSD, controls visibility, fullscreen
└── ResumePrompt component (resume prompt overlay)

AudioView.vue (191 linii)
├── 3 tryby layoutu: split (cover+viz), full (viz tło+overlay), stacked (pionowo)
├── Keyboard shortcuts (spacja, strzałki, M, 0, F) — takie same jak PlayerView
├── Auto-hide UI po 3s bezruchu
├── AudioLayoutToggle — przełącznik layoutów (bottom-right)
├── AudioVisualizer — canvas bars/wave/radial + viz mode switcher (bottom-left)
├── AudioProgressBar — seek bar + czas
├── AudioControls — transport + volume + EQ/Kolejka toggle
├── AudioCover — wyodrębniony podkomponent cover art (video/img/icon)
├── AudioTrackInfo — wyodrębniony title/artist/album + favorite button
├── player store (currentTrack, getCover, shuffle, repeat, favorites, etc.)
├── useAudioPlayer (currentTime, duration, isPlaying, play, pause, seek, setVolume, volume)
└── usePlayerStore (equalizerVisible, queueVisible)

PlayerBar.vue (265 linii)
├── player store (currentTrack, getCover, shuffle, repeat, volume, favorites, etc.)
├── useAudioPlayer (currentTime, duration, isPlaying, play, pause, seek, setVolume)
├── Heart button — toggleFavorite (favorites persistencja w electron-store)
├── Disc3 button — nawigacja do /audio
└── Cover art: player.getCover() → video/img/icon fallback

Views → czytają store'y + wywołują akcje store (BEZ moduleManager.switchTo — patrz 3.5)
```

---

## 13. Video Audio Transcoding

### 13.1 Problem

Chromium (i Electron) nie wspiera kodeków AC3, E-AC3, DTS, TrueHD i wielu innych używanych w plikach MKV z dubbingiem. Nawet natywne `<video>` bez Web Audio nie odtworzy tych kodeków. Rozwiązanie: transkodowanie audio do AAC przez ffmpeg.

### 13.2 Strategia chunk-first

Pełny transkoding filmu 2-godzinnego zajmuje 30-60s. Zamiast czekać:

1. **Fast chunk** (30s z aktualnej pozycji, `ffmpeg -ss <pos> -t 30`) → ~1s
2. Chunk grany natychmiast przez ukryte `<audio>` przez Web Audio (EQ, głośność)
3. W tle: pełny transkoding całego pliku do AAC (`ffmpeg -i file -c:a aac full.m4a`)
4. Gdy gotowe: cicha podmiana (disconnect → connect z pełnym plikiem)
5. Kolejne odpalenia: instant (cache w `%TEMP%/onda/audio-transcodes/`)

### 13.3 Architektura

```
┌────────────────────────────────────────────────────────────────┐
│                     MAIN PROCESS                               │
│  media:checkAudioCodec → ffprobe                               │
│  media:transcodeAudioChunk → ffmpeg -ss <pos> -t 30 -c:a aac  │
│  media:transcodeAudio → ffmpeg -i file -c:a aac full.m4a       │
├────────────────────────────────────────────────────────────────┤
│                      RENDERER                                  │
│  useVideoPlayer.checkVideoAudioCodec():                         │
│    1. checkAudioCodec(path) → unsupported → mute <video>       │
│    2. transcodeAudioChunk(path, seekPos, 30) → play chunk      │
│    3. transcodeAudio(path) → swap to full when ready           │
│  audioEngine.connectSecondaryAudio(path, timeOffset):          │
│    - new Audio() + createMediaElementSource + connect to chain  │
│  Sync: seekSecondaryAudio, play/pauseSecondaryAudio            │
│  Volume: <video volume=0>, Web Audio gainNode controls volume   │
└────────────────────────────────────────────────────────────────┘
```

### 13.4 Kluczowe szczegóły

- `secondaryAudioOffset` — chunk zaczyna się od `seekPos`, pełny plik od 0. `seekSecondaryAudio(videoTime)` konwertuje: `audioEl.currentTime = videoTime - offset`
- `currentTime` watcher automatycznie synchornizuje seek
- `isPlaying` watcher kontroluje play/pause secondary audio
- Volume watcher: gdy `hasSecondaryAudio`, video mute, Web Audio gainNode steruje głośnością
- `disconnectSecondaryAudio()` wołane przy `disconnectNodes()`, `connectAudio()`, `destroy()`
- Cache: hash MD5 ścieżki pliku, `%TEMP%/onda/audio-transcodes/<hash>.m4a`
- Chunk cache: `<hash>_<start>_<dur>.m4a`

---

## 14. Kluczowe Pliki

| Plik                        | Linii | Znaczenie                                                                       |
| --------------------------- | ----- | ------------------------------------------------------------------------------- |
| `ipc/handlers.ts`           | 24    | Orkiestrator IPC — rejestruje 12 sub-handlerów (13 plików, 1,765 linii łącznie) |
| `ipc/library-handlers.ts`   | 383   | Biblioteka: scan, playlisty, CRUD, tagi ID3                                     |
| `ipc/media-handlers.ts`     | 284   | Metadane, kodeki, transkodowanie AC3/DTS                                        |
| `ipc/fs-handlers.ts`        | 233   | Operacje na plikach: readdir (batch), readFile, writeFile, rename, delete       |
| `ipc/cover-cache.ts`        | 221   | Cache okładek + thumbnaili (Sharp fallback + Windows thumbcache)                |
| `media-server.ts`           | 94    | Lokalny HTTP server dla mediów (range requests 206, CORS, port losowy)          |
| `ImageViewer.vue`           | 486   | Lightbox: dual-image transitions (fade/slide/zoom/swirl), slideshow, thumbnails |
| `player.ts` (store)         | 449   | Player + kolejka + history + coverCache + favorites (electron-store persistence)|
| `pip-manager.ts`            | 421   | PipManager — PiP window + preview window, position/size, show/hide              |
| `useVideoPlayer.ts`         | 406   | Video composable: setup, PiP, subtitles, AC3/DTS, lifecycle                     |
| `useSubtitleRenderer.ts`    | 375   | JASSUB: wasm/worker init, buildFontMap (MKV+Google+lokalne), binary fonts       |
| `audioEngine.ts`            | 631   | Class AudioEngine — gapless, crossfade, EQ, RAF loop, EventBus                  |
| `index.ts` (main)           | 367   | Okno, tray, skróty globalne, PiP init, splash screen                           |
| `PlayerControls.vue`        | 302   | Kontrolki: play/pause, skip, speed, filter, volume, time                        |
| `ExplorerView.vue`          | 517   | Eksplorator — 4 widoki, breadcrumb, streaming readdir, context menu             |
| `PlayerView.vue`            | 313   | Video player UI orchestration + keyboard shortcuts                              |
| `Sidebar.vue`               | 276   | Nawigacja + resize + playlisty + DnD                                            |
| `PlayerBar.vue`             | 265   | Dolny pasek: MediaCover, AudioProgressBar, controls, volume, Heart, Disc3       |
| `QueuePanel.vue`            | 256   | Kolejka + historia (vuedraggable)                                               |
| `TitleBar.vue`              | 253   | Custom titlebar + tabs + context menu                                           |
| `LibraryView.vue`           | 623   | Biblioteka: list/cover grid/search/filter/delete                                |
| `TrackTagEditor.vue`        | 261   | ID3 tag editor modal                                                            |
| `MusicBrainzLookup.vue`     | 235   | MusicBrainz search: album, metadata, cover art                                  |
| `constants.ts`              | 225   | Formaty, presety EQ, motywy, defaults, shortcuts                                |
| `LibraryPlaylistManager.vue`| 170   | Panel playlist: create/delete/toggle/rename                                     |
| `pip.ts` (renderer)         | 170   | PiP bundle: JASSUB, IPC, progress bar, close button                             |
| `preload/index.ts`          | 167   | contextBridge: 43 API (window.api)                                              |
| `AudioView.vue`             | 191   | Audio player — 3 layouty, sub-components (AudioCover, AudioTrackInfo)           |
| `SettingsAppearance.vue`    | 188   | Motyw, akcent, czcionka                                                         |
| `CommandPalette.vue`        | 157   | Ctrl+K modal search                                                             |
| `SettingsPiP.vue`           | 152   | PiP: pozycja, rozmiar, podgląd na żywo                                          |
| `app.vue`                   | 187   | Root layout: ErrorBoundary, Theme, Toast, context menu, route routing           |
| `audioEngine.ts` (modules)  | 631   | Class AudioEngine singleton — gapless, crossfade, EQ, RAF loop, EventBus        |
| `Equalizer.vue`             | 143   | 10-pasmowy EQ + presety                                                         |
| `AudioControls.vue`         | 142   | Transport controls + volume slider                                              |
| `useAudioPlayer.ts`         | 159   | Singleton: audio state bridge, effectScope(true) + watch(), EventBus sub        |
| `settings.ts` (store)       | 159   | Settings store + debounced IPC save                                             |
| `splash.html`               | 131   | Splash screen — canvas wizualizacja dźwiękowa (64 barów)                        |
| `AudioVisualizer.vue`       | 126   | Canvas visualizer: bars/wave/radial                                              |
| `router/index.ts`           | 117   | 8 tras + beforeEach guard + smart path + recursion guard                         |
| `SettingsDependencies.vue`  | 156   | Status zależności: FFmpeg, FFprobe, yt-dlp, mkvextract + instalacja             |

---

## 15. Konwencje Kodowe

### TypeScript

- Interface-first design (types/ folder)
- `strict: true` + `noImplicitAny: true` (Phase 3.6)
- `noUncheckedIndexedAccess` — guard clauses dla tablic
- `no-explicit-any: off` (practical — JASSUB, Electron APIs)
- `no-unused-vars` z patternami: `^_` ignore, `allowEmptyCatch`

### Vue 3

- `<script setup lang="ts">` exclusively
- Composition API (brak Options API)
- Composables w `composables/` (useXxx pattern)

### Pinia

- Setup stores: `defineStore('name', () => {...})`
- Hydratacja z electron-store (nie pinia-plugin-persistedstate)
- Auto-save w update* functions
- `effectScope(true)` + `watch()` — useAudioPlayer uses detached effectScope do nasłuchiwania zmian store (nie `$subscribe` — patrz 17.0a)
- `$subscribe()` / `watch()` — useAudioPlayer uses `effectScope(true)` + `watch()` do nasłuchiwania zmian store (nie `$subscribe` — patrz 17.0a)

### CSS

- Tailwind CSS 4 utility-first
- Dynamiczne CSS variables przez JS (`applyTheme` w App.vue)
- Brak scoped CSS (exception: page transitions w App.vue)
- Accent colors: `--color-accent-base`, `--color-accent-hover`, `--color-accent-strong`, `--color-accent-ghost`

### Formatting (Prettier)

- `semi: true` (semicolony wymagane)
- `singleQuote: true`
- `printWidth: 100`
- `trailingComma: none`
- `endOfLine: lf`

### ESLint

- Flat config (`eslint.config.mjs`)
- `prettier/prettier: 'off'` — Prettier zarządza formatowaniem
- `vue/first-attribute-linebreak: 'error'`

### Module System

- Każdy moduł rejestruje się w ModuleManager przy init
- `switchTo()` → deactivate old (AWAIT) → activate new
- Player jest background-capable (nie pauzuje przy nawigacji)

---

## 16. Komendy

| Komenda                  | Cel                          |
| ------------------------ | ---------------------------- |
| `npm run dev`            | Dev server                   |
| `npm run build`          | Build + typecheck            |
| `npm run typecheck`      | Typecheck node + web         |
| `npm run typecheck:node` | Typecheck main + preload     |
| `npm run typecheck:web`  | Typecheck renderer (vue-tsc) |
| `npm run lint`           | ESLint                       |
| `npm run format`         | Prettier                     |
| `npm run build:win`      | NSIS installer               |
| `npm run build:mac`      | DMG                          |
| `npm run build:linux`    | AppImage/snap/deb            |
| `npm run start`          | Preview build                |

---

## 17. Konfiguracja Projektu

### electron.vite.config.ts

- Main/Preload: `externalizeDepsPlugin()`
- Renderer: `vue()` + `tailwindcss()` + custom `wasmMime()` plugin (Content-Type: application/wasm)
- Alias: `@renderer` → `src/renderer/src`, `@shared` → `src/shared` (Phase 3.5)
- Worker format: `es`
- Multi-page: `index.html` + `pip.html`
- `assetsInclude: ['**/*.wasm']`

### tsconfig.web.json

- `strict: true` + `noImplicitAny: true` (Phase 3.6)
- `ignoreDeprecations: "6.0"` (dla `baseUrl` — TS 7.0 removal)
- Path alias: `@renderer/*` → `src/renderer/src/*`, `@shared/*` → `src/shared/*`

### tsconfig.node.json

- `ignoreDeprecations: "5.0"`
- `types: ["electron-vite/node"]`

### electron-builder.yml

- NSIS (Windows), DMG (macOS), AppImage/snap/deb (Linux)
- asarUnpack: `resources/**`
- electron mirror: `npmmirror.com`

---

Ostatnia aktualizacja: 2026-07-26 (Phase 1–3 zakończone, Faza 4 — explorer, Faza 5 — ImageViewer, library, settings, 17.3 webSecurity)

---

## 18. Zmiany od 2026-07-18

### 18.0 Separacja Audio/Video plus refactor (2026-07-19)

**Problem:** Audio i wideo dzieliły ten sam store state (currentTime, isPlaying), powodując konflikty gdy odtwarzacz audio i wideo próbowały kontrolować ten sam stan.

**Rozwiązanie:**

- **`useMediaPlayer.ts` usunięty** → zastąpiony przez **`useAudioPlayer.ts`** (singleton composable)
- `audioEngine.ts` — dodany callback system (`onTimeUpdate`, `onDurationChange`, `onPlayStateChange`, `onTrackEnd`). Silnik audio NIE pisze bezpośrednio do store.
- `useAudioPlayer.ts` — singleton z własnymi refami (`currentTime`, `duration`, `isPlaying`). Nasłuchuje store przez `effectScope(true)` + `watch()` (nie `$subscribe` — patrz niżej). Synchronizuje stan audio → store.
- `PlayerView.vue` — wideo ma WŁASNY independently zarządzany element `<video>` z własnym `currentTime` i `isPlaying`
- `PlayerBar.vue` — wyświetla okładki (video loop, image, icon fallback) tak jak QueuePanel

### 18.1 Audio w Tle — Nawigacja (2026-07-19)

**Problem:** Każde przejście do innego widoku Dezaktywowało PlayerModule → `audioEngine.deactivate()` → pauza audio + stop RAF loop + AudioContext suspend.

**Rozwiązanie:**

- **Usunięto `moduleManager.switchTo()` z 7 widoków** (Home, Explorer, Library, YouTube, Downloads, Settings, Search)
- **Router `afterEach` smart path** — gdy `currentActive === 'player'` i `currentTrack?.type === 'audio'`: aktywuje docelowy moduł BEZ dezaktywacji playera
- **AudioEngine `resume()`** — nowa metoda: `audioCtx.resume()` + restart RAF loop (odwraca `deactivate()`)
- **`useAudioPlayer.resumeAndPlay()`** — centralna funkcja: wywołuje `audioEngine.resume()` + `audioEngine.play()` po 50ms delay
- **PlayerBar widoczny na wszystkich trasach** (oprócz `/player` i `/audio`) gdy audio playing
- **App.vue** — usunięto auto-nawigację do `/audio` przy nowym utworze audio

**Video→audio fix:**

- Po odtworzeniu wideo, `deactivate()` zatrzymuje RAF loop + pauzuje AudioContext
- Gdy audio startuje później, `resume()` przywraca oba — RAF loop i AudioContext

### 18.2 Fixy (2026-07-19)

- **Shuffle z pendingQueue** — `nextTrack()` teraz losuje random index z pendingQueue (nie tylko shift)
- **repeat='one' audio** — resetuje currentTime zamiast wywoływać setTrack (brak duplikatów w historii)
- **repeat='one' video** — `el.currentTime = 0; el.play()` bezpośrednio (bez pause → nextTrack → setTrack)
- **reorderQueue** — adjustedTo fix dla sytuacji gdy from < to
- **Node.js v26 compat** — patched nested backticks w electron-vite (`node_modules/electron-vite/dist/chunks/lib-q6ns0vZr.js`)

### 18.3 Favorites + AudioView Refactor (2026-07-19)

**Favorites system:**

- `favorites: string[]` w player store — przechowuje ścieżki ulubionych (Phase 1: zamieniono z `Set<string>` dla serializacji)
- `toggleFavorite(path)`, `isFavorite(path)` — akcje store
- Heart button w PlayerBar + AudioView (wszystkie 3 layouty)
- Persistencja: electron-store przez IPC `settings:set`/`settings:get` klucz `favorites` (array paths)
- Keyboard shortcut: F (toggle favorite)

**AudioView refactoring:**

- **`AudioCover.vue`** (30 linii) — wyodrębniony podkomponent cover art (video loop / image / icon fallback)
- **`AudioTrackInfo.vue`** (33 linie) — wyodrębniony podkomponent title/artist/album + favorite button
- Oba użyte we wszystkich 3 layoutach (split/full/stacked) — eliminacja duplikacji kodu
- **AudioView** (165 linii) — uproszczony przez ekstrakcję sub-komponentów

**Layout toggle + Viz mode:**

- **Layout toggle** — przeniesiony z `fixed top-20 right-4` do `fixed bottom-20 right-4`, auto-chowa się z `showUI`
- **Viz mode button** — bottom-left w full layout, cykluje bars/wave/radial
- `AudioVisualizer` eksponuje `style` + `cycleStyle()` przez `defineExpose`

### 18.4 Phase 1 — Stabilność (2026-07-20)

**8 zmian — priorytet CRITICAL:**

- **1.1** — Zastąpiono `require('electron')` static importem `app` w `handlers.ts`
- **1.2** — Dodano ErrorHandler (`app.config.errorHandler`/`warnHandler`) w `main.ts` + `ErrorBoundary.vue` — globalny catcher błędów komponentów
- **1.3** — Usunięto `win!` non-null assertions w `handlers.ts` — dodano guard clauses (`if (!win) return`)
- **1.4** — Ujednolicono `window.api?.` optional chaining we wszystkich store'ach i composablach — `safeInvoke` wrapper w `utils/ipc.ts`
- **1.5** — Przeniesiono `init()` w `usePiP` do `onMounted` — listenery IPC rejestrowane tylko gdy komponent zmontowany
- **1.6** — Dodano `currentLoadId` flagę w `useVideoPlayer` — race condition guard dla subtitles, duration, cover
- **1.7** — Dodano try-catch guard w `audioEngine.handleEnded` dla `usePlayerStore()` — bezpieczny dostęp gdy store niezainicjalizowany
- **1.8** — Zmieniono `Set<string>` na `string[]` dla `favorites` — poprawna serializacja do electron-store

### 18.5 Phase 2 — Wydajność (2026-07-20)

**7 zmian — priorytet HIGH:**

- **2.1** — Static import `electron-store` z lazy init przez dynamic import (ESM workaround) — eliminacja kosztownego `await import()` przy każdym odczycie/zapisie
- **2.2** — Debounce 300ms na `save()` w settings store — eliminacja write storm przy przeciąganiu sliderów
- **2.3** — Wszystkie `execSync` → `execAsync` w `handlers.ts` — odblokowanie event loop main process (FFmpeg, yt-dlp, mkvextract, ffprobe)
- **2.5** — Page Visibility API — RAF loop pauzowany gdy `document.hidden`, wznawiany gdy okno widoczne + audio gra
- **2.6** — Cache dla `buildFontMap` w `useSubtitleRenderer.ts` — hash zawartości ASS → fontMap, pomija sieciowe `queryRemoteFonts` przy powtórnych ładowaniach
- **2.7** — Usunięto `urlToDataUrl` — WASM URL-e przekazywane oryginalnie do JASSUB (Vite już serwuje poprawnie, bez kosztownej konwersji ArrayBuffer → base64)
- **2.8** — Podział `SettingsView.vue` (772 → 69 linii) na 9 komponentów per-zakładka lazy-importowanych: `SettingsAppearance`, `SettingsPlayback`, `SettingsPiP`, `SettingsDownload`, `SettingsShortcuts`, `SettingsNetwork`, `SettingsApiKeys`, `SettingsUpdates`, `SettingsDependencies`

### 18.6 Fixy po Phase 2 (2026-07-20)

- **electron-store ESM import** — lazy init z `(() => new Store())()` przez dynamic import — circumwencja ESM/CJS mismatch w Node.js
- **Brak `await` na `getMkvExtractPath()`** — czcionki z MKV nie były wyciągane bo Promise nie był awaitowany w `buildFontMap`
- **ErrorBoundary brak single root element** — warning Transition w Vue: `<div v-if>` i `<slot v-else>` opakowane w `<template>`

### 18.7 Phase 3 — Architektura (2026-07-20)

**7 zmian — refaktoryzacja wewnętrznej komunikacji i bezpieczeństwa typów:**

#### 3.1 Router: afterEach → beforeEach z await switchTo (Phase 3.1)

**Problem:** `afterEach` nie pozwalał na `await moduleManager.switchTo()` — przełączanie modułów było asynchroniczne i powodowało race condition (router nawigował dalej zanim poprzedni moduł się dezaktywował).

**Rozwiązanie:**

- `router.beforeEach` z `await moduleManager.switchTo(moduleId)` — przełączanie modułów **synchroniczne** względem nawigacji
- Recursion guard: `_isSwitching` flag + `_pendingSwitch` — zapobiega nieskończonej rekurencji gdy `switchTo` wywołuje `router.push`
- Smart path: `beforeEach` sprawdza `currentActive === 'player' && currentTrack?.type === 'audio'` — audio w tle bez dezaktywacji playera

#### 3.2 EventBus — audioEvents.ts (Phase 3.2)

**Problem:** `audioEngine.ts` miał 4 module-level callbacki (`_onTimeUpdate`, `_onDurationChange`, `_onPlayStateChange`, `_onTrackEnd`), które `useAudioPlayer` ustawiał bezpośrednio. Silne sprzężenie — zmiana w jednym wymagała zmiany w drugim.

**Rozwiązanie:**

- Nowy `utils/audioEvents.ts` z klasą `AudioEventBus` — `on()`, `off()`, `emit()`
- `audioEngine` emituje zdarzenia: `timeUpdate`, `durationChange`, `playStateChange`, `trackEnd`, `trackLoaded`
- `useAudioPlayer` subskrybuje przez `audioEvents.on()` zamiast ustawiać callbacki
- Luźniejsze sprzężenie, wsparcie dla wielu subskrybentów, łatwiejsze testowanie

#### 3.3 audioEngine.ts → Class AudioEngine (Phase 3.3)

**Problem:** `audioEngine.ts` używał 15+ module-level `let` zmiennych jako mutable state. Brak enkapsulacji — każda funkcja mogła modyfikować stan globalny, trudno było śledzić zależności.

**Rozwiązanie:**

- Przeniesiono wszystkie `let` zmienne do private fields klasy `AudioEngine`
- Wszystkie funkcje → metody klasy
- Singleton: `export const audioEngine = new AudioEngine()`
- Methods: `init()`, `loadTrack()`, `play()`, `pause()`, `seek()`, `deactivate()`, `destroy()`, `resume()`, `setVolume()`, `setPlaybackRate()`, `connectVideoElement()`, `disconnectVideoElement()`, itd.
- Privatized: `rafLoop()`, `handleEnded()`, `startCrossfade()`, `swap()`, `ensureNextPreloaded()`, `savePosition()`, `applyReplayGain()`, itd.

#### 3.4 Keyboard events → usePlayerKeyboard.ts (Phase 3.4)

**Problem:** Wszystkie skróty klawiszowe dla wideo playera były zdefiniowane bezpośrednio w `PlayerView.vue`, zwiększając jego odpowiedzialność i utrudniając testowanie.

**Rozwiązanie:**

- Ekstrakcja do `composables/usePlayerKeyboard.ts` (106 linii)
- Typowane parametry: `{ player, settings, vp, showOSD, skip, setSpeed, toggleFullscreen }`
- `PlayerView.vue` spadł z 357 → 292 linii

#### 3.5 Wspólne stałe — @shared/constants.ts (Phase 3.5)

**Problem:** `VIDEO_EXTS` i `AUDIO_EXTS` były zduplikowane w `handlers.ts` i `useOpenMedia.ts`. Ryzyko rozjazdu definicji.

**Rozwiązanie:**

- Nowy plik `src/shared/constants.ts` (13 linii) z deduplikowanymi stałymi
- Alias `@shared` dodany w `tsconfig.web.json`, `tsconfig.node.json` i `electron.vite.config.ts`
- Importowany przez main, preload i renderer

#### 3.6 strict: true + noImplicitAny: true (Phase 3.6)

**Problem:** TypeScript `strict: false` pozwalał na `any` i niejawnie `undefined`, maskując potencjalne błędy runtime.

**Rozwiązanie:**

- Włączono `strict: true` + `noImplicitAny: true` w obu `tsconfig.web.json` i `tsconfig.node.json`
- Fixy: usunięto nieużywane importy (`Ref`, `onErrorCaptured`, `player`), naprawiono ComputedRef style binding, dodano type declaration dla `lfa-ponyfill`, `noUncheckedIndexedAccess` guards w `pip-manager.ts` i `handlers.ts`
- `npm run typecheck` — 100% clean (0 błędów)

#### 3.7 dependencies + priority w AppModule (Phase 3.7)

**Problem:** ModuleManager nie wspierał kolejności inicjalizacji ani sprawdzania zależności między modułami.

**Rozwiązanie:**

- Dodano `dependencies?: string[]` i `priority?: number` do `AppModule` interface
- `initAll()` sortuje moduły po `priority` (malejąco)
- Warnuje o brakujących modułach zależnych (`console.warn`)

### 18.8 Height Chain Fix (2026-07-20)

**Problem:** `ErrorBoundary.vue` używał `h-full` (`height: 100%`). W CSS `height: 100%` patrzy na `height` property rodzica, nie na flex-allocated height. `<main>` miało tylko `flex-1` (bez explicit height), więc `h-full` wewnątrz niego wynosiło 0px. Powodowało to:

- Video player nie na pełną wysokość (PlayerView nie wypełniał main)
- Scroll w stacked layout AudioView (wysokość kontenera mniejsza niż content)

**Rozwiązanie:**

- `<main class="... flex flex-col">` — flex container
- `ErrorBoundary` → `<div class="flex-1 min-h-0">` — flex child rozciąga się na flex-allocated height main
- Wszystkie widoki używają `h-full` → poprawnie dziedziczą z flex-allocated height

### 18.0a Dlaczego effectScope(true) + watch() zamiast $subscribe

`player.$subscribe()` w module-level singleton NIE fire'uje się poprawnie po init (Pinia limitation). `watch()` w module-level też nie fire'uje się dla subsequent mutations.

**Rozwiązanie:** `effectScope(true)` — detached scope, nie jest destroy'owany gdy komponent się odmontowuje. `watch()` wewnątrz effectScope działa poprawnie dla subsequent mutations.

Kluczowe: `effectScope(true)` musi być utworzony na module level (nie w composable call), a watch() musi być wewnątrz niego. Osobny scope dla muted/volume watchers.

### 18.9 Faza 4 — Explorer Overhaul + Context Menu Fix (2026-07-21/22)

**Explorer — 4 tryby widoku:**
- `icon` — duże ikony (domyślny), `list` — tabela, `grid` — miniatury, `details` — szczegóły
- `ExplorerNavPane.vue` — lewy panel nawigacyjny z drzewem folderów i szybkim dostępem
- `ExplorerToolbar.vue` — górny pasek z trybami widoku i sortowaniem
- `ExplorerGridItem.vue` — kafelek grid view z ikonami/thumbnails + context menu `@contextmenu.stop.prevent`
- `ExplorerTableRow.vue` — wiersz list view z kolumnami + context menu `@contextmenu.stop.prevent`
- Streaming readdir: batch IPC `fs:readdir:batch` (200/batch), `explorer.store` batchPush/batchReset
- Virtual scrolling: `@tanstack/vue-virtual` dla wszystkich trybów, overscan 2

**Context Menu — naprawa propagacji:**
- Problem: `@contextmenu.prevent` nie stopuje propagacji, `handleEmptyContextMenu` na scrollRef nadpisywał menu
- Fix: `@contextmenu.stop.prevent` na indywidualnych itemach

**Library — rozbudowa:**
- `LibraryTrackRow.vue` — wiersz z okładką, title/artist/album, duration, favorite, delete
- `AlbumCard.vue`, `VideoCard.vue` — karty z cover/thumbnail
- `DirNode.vue` — rekurencyjny folder tree
- `LibraryPlaylistManager.vue` — panel playlist z create/delete/rename/add/remove
- `TrackTagEditor.vue` — modal edycji ID3 tagów (title, artist, album, genre, year, track, cover) przez IPC `media:writeTag` + `media:writeCover`
- `MusicBrainzLookup.vue` — modal wyszukiwania albumów przez MusicBrainz API, auto-fill tagów + cover
- `LibraryView.vue` — 623 linie: list/cover grid, search, filter, sort, bulk delete

**Settings — 12 podkomponentów:**
- `SettingsAppearance.vue`, `SettingsPlayback.vue`, `SettingsDependencies.vue`,
- `SettingsPiP.vue`, `SettingsShortcuts.vue`, `SettingsToast.vue`,
- `SettingsLibraryFolders.vue`, `SettingsDownload.vue`, `SettingsNetwork.vue`,
- `SettingsApiKeys.vue`, `SettingsLanguage.vue`, `SettingsUpdates.vue`
- `SettingsView.vue` — shell z tab navigation, lazy import komponentów
- `main/handlers.ts` — +680 linii nowych handlerów (fs:readdir:batch, fs:rename, fs:mkdir, fs:delete, media:writeTag, media:writeCover, musicbrainz:*)

**i18n:**
- `vue-i18n` + `locales/en.ts` (392), `locales/pl.ts` (393)
- Language switch w SettingsLanguage.vue

**Command Palette:**
- `CommandPalette.vue` — Ctrl+K modal, wyszukiwanie router + actions

**Globalne:**
- `ToastNotification.vue` — system powiadomień, `ui.store` zarządza toasts
- `ErrorBoundary.vue` — izolacja błędów komponentów
- `MediaCover.vue` — uniwersalny cover (wideo loop/img/icon fallback)
- `TrackInfo.vue` — display info
- `logger.ts` — logger

### 18.9.5 Faza 4.5 — Library & Settings (2026-07-21/22)

**Library — rozbudowa:**
- `LibraryTrackRow.vue` — wiersz z okładką, title/artist/album, duration, favorite, delete
- `AlbumCard.vue`, `VideoCard.vue` — karty z cover/thumbnail
- `DirNode.vue` — rekurencyjny folder tree
- `LibraryPlaylistManager.vue` — panel playlist z create/delete/rename/add/remove
- `TrackTagEditor.vue` — modal edycji ID3 tagów przez IPC `media:writeTag` + `media:writeCover`
- `MusicBrainzLookup.vue` — modal wyszukiwania albumów przez MusicBrainz API
- `LibraryView.vue` — 623 linie: list/cover grid, search, filter, sort, bulk delete

**Settings — 12 podkomponentów:**
- `SettingsAppearance.vue`, `SettingsPlayback.vue`, `SettingsDependencies.vue`,
- `SettingsPiP.vue`, `SettingsShortcuts.vue`, `SettingsToast.vue`,
- `SettingsLibraryFolders.vue`, `SettingsDownload.vue`, `SettingsNetwork.vue`,
- `SettingsApiKeys.vue`, `SettingsLanguage.vue`, `SettingsUpdates.vue`
- `SettingsView.vue` — shell z tab navigation, lazy import
- `handlers.ts` — +680 linii (fs:rename, fs:mkdir, fs:delete, media:writeTag, musicbrainz:*)

**i18n:** `vue-i18n` + `locales/en.ts` (392), `locales/pl.ts` (393)

**Globalne:** `CommandPalette.vue` (Ctrl+K), `ToastNotification.vue`, `ErrorBoundary.vue`, `MediaCover.vue`

### 18.10 Faza 5 — ImageViewer + Fixy (2026-07-22/23)

**ImageViewer — kompletny przepis (550 linii):**
- Dual-image transition system: stary obrazek exit + nowy enter jednocześnie
- 4 tryby przejścia: fade (opacity), slide (translate+blur), zoom (scale 0.7→1), swirl (scale 0.5 + rotate -15deg + blur)
- `will-change: transform, opacity, filter` dla GPU acceleration
- `cubic-bezier(0.4, 0, 0.2, 1)` — smooth easing

**Toolbar po prawej stronie:**
- Górna grupa: Close (X), Fit to Screen (Maximize2), Zoom In/Out, Fullscreen (Maximize)
- Dolna grupa: Play/Pause, Previous/Next, Settings (Settings2)
- Slideshow dropdown: interval (1s/2s/3s/5s/10s), transition type/duration, loop toggle
- Loop mode: `hasPrev`/`hasNext` uwzględniają loop

**Thumbnail strip:**
- Bottom filmstrip, toggle przez PanelBottom button
- Lazy cache: `thumbCache = new Map()`, ładuje ±4 wokół currentIndex
- Click-to-navigate

**Fullscreen:**
- Fullscreen API toggle + F key
- `fullscreenchange` listener, cleanup na unmount
- Maximize2 → fitToScreen (scale=1, rotation=0)
- Double-click na image → fitToScreen

**Slideshow:**
- Progress bar na górze viewportu, `transition-all duration-150 ease-linear`
- Działa przez setInterval(16ms), odświeża progress bar
- Przy pauzie: progress bar zatrzymuje się

**Mouse wheel zoom:**
- `@wheel.prevent` na image area → zoomIn/zoomOut

**Footer:**
- Counter (X/Y), filename, zoom %, rotation degrees
- showThumbnails toggle button

**Context Menu fix:**
- `@contextmenu.prevent` → `@contextmenu.stop.prevent` na ExplorerView.vue, ExplorerGridItem.vue, ExplorerTableRow.vue
- Fix TypeScript: `setInterval` → `changeInterval` (shadow global)
- 0 typecheck errors

### 18.11 Faza 5.5 — ImageViewer Performance + UI Consistency (2026-07-23)

**Problem 1: Zoom freeze przy dużych zdjęciach**
- `fs:readFile` ładuje pełny plik (20MB → ~27MB base64 w DOM)
- Brak debounce na wheel → szybkie zmiany zoomu kaskadują repainty
- CSS `scale()` bez GPU acceleration, brak `contain: layout style paint`

**Fix:**
- Debounce wheel przez `requestAnimationFrame` (50ms coalesce)
- `scale3d()` zamiast `scale()` dla GPU compositing
- `contain: layout style paint` na kontenerze obrazka
- Opcjonalny downscale przy ładowaniu: canvas resize do max viewport

**Problem 2: Duże foldery zdjęć ładują się wolno**
- Thumbnail strip ładuje pełne pliki (brak miniaturek)
- Brak preloadu sąsiednich obrazków
- Każda nawigacja → pełny `fs:readFile` → IPC → base64

**Fix:**
- Nowe IPC `media:getThumbnail` z `nativeImage.resize({ width: 320 })` w main process
- Preload następnego obrazka (index+1) w tle
- Lazy loading thumbnaili przez dedykowany kanał (nie `fs:readFile`)
- Image pool: 1 aktywny + 1 preload (anulowanie przy szybkiej nawigacji)

**Problem 3: UI niespójne z aplikacją**
- Hardcodowane `bg-black/95`, `bg-black/60` zamiast theme CSS variables
- Brak spójności z systemem motywów

**Fix:**
- `bg-black/*` → `bg-bg-base/*`, `bg-bg-overlay/*`, `bg-bg-surface/*`
- `text-white/*` → `text-fg-base/*`, `text-fg-muted/*`
- `border-white/*` → `border-border-default/*`

**Rozszerzenia slideshow:**
- Ken Burns effect (powolny zoom + pan) przez RAF loop
- Random shuffle (Fisher-Yates) z opcją w settings
- Transition preview w settings dropdown

**Co zaimplementowano (2026-07-23) — Runda 1 (CSS + zoom debounce + thumbnail IPC + Ken Burns):**

| Plik | Zmiana |
| ---- | ------ |
| `shared/types/ipc.ts` | +`media:getThumbnail` channel |
| `main/ipc/cover-cache.ts` | +handler: `nativeImage.createFromPath().resize(320).toDataURL()` |
| `ImageViewer.vue` | Tła: CSS vars, Zoom: debounce 50ms + RAF + scale3d + contain, Thumb: `media:getThumbnail`, Preload: next+LRU cache(5), Slideshow: Ken Burns + shuffle |
| `main.css` | +`.contain-layout { contain: layout style paint }` |

**Runda 2 + 3 — file:// → onda:// protocol + Sharp + downscale:**

| Plik | Zmiana | Zysk |
| ---- | ------ | ---- |
| `src/main/utils/sharp.ts` | **NOWY** — SharpService: getThumbnail, batchThumbnails, resize przez sharp (libvips) | Batch 5000 thumbnaili ~2-5 min (concurrency n-CPU) zamiast godzin |
| `src/main/index.ts` | +`protocol.registerSchemesAsPrivileged('onda')` + `protocol.handle('onda', handler)` | Custom protocol: path traversal protection, query params (?w=1920 downscale, ?t=320 thumb) |
| `ImageViewer.vue` | `onda://` zamiast `file://`, domyślnie `?w=1920` (300KB zamiast 20MB), full-res tylko przy zoom >1.5× | 1. ładowanie 50ms, RAM ~5MB zamiast 80MB+ |
| `main/ipc/cover-cache.ts` | `createThumbnailFromPath` (Windows thumbcache) → Sharp fallback. Batch thumbnails. Cover przez Sharp downscale 500px | Thumbnail 1. raz ~5ms (OS cache) lub ~20ms (Sharp) |
| `index.html` | CSP +`onda:` w default-src i img-src | Onda protocol dozwolony |

**Jak to teraz działa:**

```
PRZED: Użytkownik klika zdjęcie
  → IPC fs:readFile → main czyta 20MB → base64(27MB) → IPC powrót → data: URI w DOM
  → Zoom = repaint 27MB elementu = FREEZE
  → RAM: 80MB+

Runda 2: Użytkownik klika zdjęcie
  → src="file:///C:/zdjecie.jpg"
  → Chromium WIC → GPU texture
  → 0 IPC, 0 base64, RAM ~30MB
  → Zoom = GPU scale shader = 60fps

Runda 3: Użytkownik klika zdjęcie
  → src="onda:///C:/zdjecie.jpg?w=1920" (300KB, 50ms)
  → Zoom >1.5× → src zmienia się na "onda:///C:/zdjecie.jpg" (full-res)
  → RAM: ~5MB (1920px downscale)
  → Batch 5000 thumbnaili: Sharp concurrency
  → Cover: Sharp downscale 500px przed cache
```

---

## 18.11 17.3 — webSecurity: true + Media Server + handlers.ts Split (2026-07-24/26)

### 18.11.1 17.1 — Podział handlers.ts (2026-07-24)

**Problem:** `handlers.ts` osiągnął 1,633 linii — 68 handlerów w jednym pliku. Utrudnione utrzymanie, testowanie i nawigacja.

**Rozwiązanie:** Podział na 13 plików w `src/main/ipc/`:

| Plik | Linii | Odpowiedzialność |
| ---- | ----- | ---------------- |
| `handlers.ts` | 24 | Orkiestrator: rejestruje wszystkie sub-handlery |
| `fs-handlers.ts` | 233 | Operacje na plikach (readdir batch, readFile, writeFile, rename, delete) |
| `media-handlers.ts` | 284 | Metadane, kodeki, transkodowanie audio (AC3/DTS) |
| `subtitle-handlers.ts` | 166 | Napisy embedded MKV + zewnętrzne SRT/ASS/VTT |
| `library-handlers.ts` | 383 | Biblioteka: scan, playlisty, tagi ID3, MusicBrainz |
| `dialog-handlers.ts` | 90 | Dialogi open/save/folder |
| `cover-cache.ts` | 221 | Cache okładek + thumbnaili (Sharp + Windows thumbcache) |
| `cover-handlers.ts` | 13 | Handler `media:getCover` (deleguje do cover-cache) |
| `dependency-handlers.ts` | 184 | Sprawdzanie i instalacja FFmpeg, yt-dlp, mkvextract |
| `playback-handlers.ts` | 14 | Zapamiętywanie pozycji odtwarzania |
| `settings-handlers.ts` | 23 | Odczyt/zapis ustawień (electron-store) |
| `youtube-handlers.ts` | 32 | YouTube download (yt-dlp wrapper) |
| `musicbrainz.ts` | 98 | MusicBrainz API: search, lookup, cover data |

### 18.11.2 17.2 — Timer Management: ImageViewer (2026-07-25)

**Problem:** `ImageViewer.vue` używał `setInterval`/`setTimeout` bezpośrednio, bez cleanup — ryzyko przecieków przy szybkiej nawigacji.

**Rozwiązanie:**
- Zastąpiono `setInterval` → `useIntervalFn` (VueUse) z natychmiastowym cleanup
- Zastąpiono `setTimeout` → `useTimeoutFn` (VueUse)
- Zastąpiono `requestAnimationFrame` → `useRafFn` (VueUse) dla Ken Burns effect
- Wszystkie VueUse composable automatycznie czyścią się przy `onUnmounted`

**Dodatkowo:**
- Nowy podkomponent `ImageViewerThumbnails.vue` — wydzielony pasek miniaturek z lazy cache, `scrollToCurrent()` i `preloadNearby()`
- Nowy podkomponent `ImageViewerSettings.vue` — wydzielone ustawienia slideshow
- `ImageViewer.vue` spadł z 550 → 486 linii

### 18.11.3 17.3 — webSecurity: true + Media Server (2026-07-26)

**Problem:** `webSecurity: false` wyłączało CORS i Content Security Policy w Chromium — luka bezpieczeństwa. Po włączeniu `webSecurity: true`, Chromium blokuje custom scheme `onda://` dla `<video>`/`<audio>` elementów.

**Rozwiązanie: Lokalny HTTP server dla mediów**

Wzorzec znany z Discord, VS Code, Slack — uruchomienie lokalnego serwera HTTP na `127.0.0.1` zamiast custom scheme:

```
PRZED: <video src="onda:///C:/video.mp4"> → blokowane przez webSecurity: true
PO:    <video src="http://127.0.0.1:PORT/?path=C:\video.mp4"> → działa z CORS
```

**Co zrobiono:**

| Plik | Zmiana |
| ---- | ------ |
| `src/main/media-server.ts` | **NOWY** — HTTP server: `fs.createReadStream().pipe(res)` dla range requests (206), CORS `Access-Control-Allow-Origin: *`, port losowy `server.listen(0)` |
| `src/main/index.ts` | Start serwera PRED utworzeniem okna (`await startMediaServer()`), `webSecurity: true` we wszystkich oknach (main, child, PiP), okrojony handler `onda://` tylko dla obrazków (Sharp thumbnail + resize), cleanup w `app.on('will-quit')` |
| `src/main/pip-manager.ts` | `webSecurity: true`, `normalizeFilePath` rozpoznaje `onda://` i zwraca raw path |
| `src/preload/index.ts` | `mediaServerUrl: string` udostępniony przez `ipcRenderer.sendSync('get-media-server-url')` przed ready-to-show |
| `src/preload/index.d.ts` | +`mediaServerUrl: string` w OndaAPI interface |
| `src/renderer/index.html` | CSP rozszerzony o `http://127.0.0.1:*` w `media-src`, `img-src`, `default-src`, `connect-src` |
| `src/renderer/src/modules/audioEngine.ts` | `toFileUrl()` → `${window.api.mediaServerUrl}/?path=` zamiast `file:///` |
| `src/renderer/src/composables/useVideoPlayer.ts` | `getTrackSrc()` → HTTP server URL |
| `src/renderer/src/stores/player.ts` | `captureVideoFrame()` → HTTP server URL |
| `src/renderer/src/components/MediaCover.vue` | video cover src → HTTP server URL |
| `src/renderer/src/components/explorer/ImageViewer.vue` | `toFileUrl()` → HTTP server URL (obrazy nadal przez `onda://` dla downscale) |
| `src/renderer/src/components/library/TrackTagEditor.vue` | video cover → raw path (konsystentne z MediaCover.vue) |
| `src/renderer/src/views/PlayerView.vue` | `<video crossorigin="anonymous">` — wymagane dla CORS |
| `src/renderer/src/pip.ts` | `crossOrigin = 'anonymous'` w JASSUB video element |

**Architektura media servera:**

```
media-server.ts (94 linie)
├── startMediaServer(): Promise<string>
│   ├── http.createServer(requestHandler)
│   ├── server.listen(0) → port losowy
│   └── zwraca "http://127.0.0.1:PORT"
├── requestHandler(req, res):
│   ├── CORS headers (Access-Control-Allow-Origin: *)
│   ├── Range requests: fs.createReadStream(path, { start, end }) → 206 Partial Content
│   ├── Pełne żądania: fs.createReadStream(path) → 200 OK
│   └── Content-Type z mime-types
└── stopMediaServer(): Promise<void>
    └── server.close()
```

**Co się zmieniło dla `onda://`:**
- Handler okrojony tylko do obrazków (SharpService: thumbnail + resize z query params)
- `fetch()` działa z custom scheme (tylko `<video>`/`<audio>` go blokują)
- ImageViewer nadal używa `onda://?w=1920` dla downscale

**Weryfikacja:**
- `npm run typecheck` — 0 błędów
- `npm test` — 141/141 pass
- Wszystkie debug logi usunięte

---

## 19. Przyszłe ulepszenia

### 19.1 Edycja prostych napisów (SRT, VTT, SUB)

Formaty SRT, VTT i SUB nie posiadają złożonego systemu stylów jak ASS — mają tylko tekst, czas i podstawowe formatowanie.

**Co można edytować:**

- Tekst napisów
- Timing (start/end)
- Podstawowe formatowanie (bold/italic)

**Implementacja:**

- Prosty edytor textarea z podglądem na żywo
- Przesuwanie czasu (offset wszystkich napisów)
- Import/Export plików SRT/VTT

### 19.2 Własny renderer napisów (bez JASSUB)

Dla prostych formatów (SRT, VTT) JASSUB jest overkill. Własny renderer:

- Canvas renderer dla napisów
- Parser SRT/VTT → struktury danych
- Stylowanie CSS/Canvas (kolory, czcionki, cień, obwódka)
- synchronizacja z video elementem

**Architektura:**

```
useSimpleSubtitleRenderer.ts
├── parseSRT(content) → SubtitleEvent[]
├── parseVTT(content) → SubtitleEvent[]
├── renderSubtitles(events, time, canvas)
└── applyStyleSettings(settings)
```

### 19.3 Hybrydowy system napisów

Kombinacja obu podejść:

- ASS/SSA → JASSUB (zachowuje oryginalne style)
- SRT/VTT/SUB → własny renderer (pełna kontrola)
- Auto-detect formatu i wybranie odpowiedniego renderera

### 19.4 System napisów → `sweet-subtitle`

Zastąpienie JASSUB library dedykowanym systemem napisów. `sweet-subtitle` — lekka alternatywa z lepszą obsługą formatów SRT/VTT.

**Zakres:**

- Parser SRT/VTT/ASS → jednolita struktura danych
- Renderer canvas z overlay na `<video>`
- Stylowanie CSS (kolory, czcionki, cień, obwódka, pozycjonowanie)
- Font loading (lokalne + Google Fonts fallback)
- Synchronizacja z video timeupdate
- Obsługa wielu ścieżek napisów (wybór aktywnej)

**Architektura:**

```
sweet-subtitle/
├── parser.ts          — parseSRT, parseVTT, parseASS → SubtitleEvent[]
├── renderer.ts        — canvas draw loop, stylowanie, font rendering
├── fontManager.ts     — lokalne fonty + Google Fonts + MKV binary fonts
├── synchronizer.ts    — timeupdate → aktywne eventy
└── useSubtitleSystem.ts — Vue composable: init, load, destroy, active track
```
