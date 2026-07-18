# Onda — Dokumentacja Projektu

## 1. Przegląd

**Onda** to desktopowy odtwarzacz muzyki i wideo zbudowany na Electron + Vue 3 + TypeScript + Tailwind CSS. Aplikacja obsługuje odtwarzanie lokalnych plików audio/video, eksplorację plików, bibliotekę mediów z metadanymi ID3, equalizer, wizualizację audio, kolejki odtwarzania, napisy wideo, Picture-in-Picture oraz system motywów.

**Kluczowa zasada architektury:** Aplikacja jest **modułowa** — każdy główny widok (player, explorer, library, youtube) jest niezależnym modulem z własnym cyklem życia. Centralny **ModuleManager** steruje przełączaniem modułów, gwarantując że poprzedni moduł **zakończy pracę całkowicie** przed startem następnego.

---

## 2. Stos Technologiczny

| Warstwa        | Technologia                                  |
| -------------- | -------------------------------------------- |
| Runtime        | Electron 39.8.10                             |
| Framework UI   | Vue 3.5.25 (Composition API, `<script setup>`) |
| Język          | TypeScript 5.9.3                             |
| Build          | electron-vite 5.0 + Vite 7.2.6              |
| CSS            | Tailwind CSS 4.3.2 (via `@tailwindcss/vite`) |
| Stan           | Pinia 3.0.4 + pinia-plugin-persistedstate 4.7.1 |
| Routing        | vue-router 4.6.4 (hash history, lazy loading) |
| Ikony          | @lucide/vue 1.24.0                           |
| Virtual Lists  | @tanstack/vue-virtual 3.13.32                |
| Utilitki       | @vueuse/core 14.3.0                          |
| Persystencja   | electron-store 11.0.2 (ESM, main process)   |
| Metadane audio | jsmediatags 3.9.7                            |
| Napisy ASS     | jassub 2.5.7 (wasm + web worker)             |
| Google Fonts   | lfa-ponyfill 1.1.1                           |
| Packaging      | electron-builder 26.0.12 (NSIS/DMG/AppImage) |
| Linting        | ESLint 9.39.1 (flat config) + eslint-plugin-vue 10.6.2 |
| Formatting     | Prettier 3.7.4                               |

---

## 3. Architektura Modułowa

### 3.1 Koncepcja

Aplikacja składa się z **modułów** — niezależnych funkcjonalności, które mogą być włączane i wyłączane. Każdy moduł:

- Ma własny lifecycle: `init()` → `activate()` → `deactivate()` → `destroy()`
- Rejestruje się w ModuleManagerze przy starcie
- Nie może działać równocześnie z innym modułem tego samego typu
- Musi **całkowicie zwolnić zasoby** (event listenery, timery, audio context, DOM) przed aktywacją następnego modułu

### 3.2 ModuleManager (`src/renderer/src/modules/ModuleManager.ts` — 83 linii)

```typescript
interface AppModule {
  id: string
  name: string
  init(): void
  activate(context?: unknown): void
  deactivate(): Promise<void>
  destroy(): Promise<void>
  isActive(): boolean
}

class ModuleManager {
  private modules = new Map<string, AppModule>()
  private activeModuleId: string | null = null
  register(module: AppModule): void
  async switchTo(moduleId: string, context?: unknown): Promise<void>
  async deactivateAll(): Promise<void>
  getActive(): AppModule | null
  get<T extends AppModule>(id: string): T
}
```

### 3.3 Lista Modułów

| ID         | Moduł          | Plik               | Linii | Opis                   | Zasoby do zwolnienia                              |
| ---------- | -------------- | ------------------ | ----- | ---------------------- | ------------------------------------------------- |
| `player`   | PlayerModule   | PlayerModule.ts    | 45    | Odtwarzacz audio/video | AudioContext, RAF loop, audio/video, event listenery |
| `explorer` | ExplorerModule | ExplorerModule.ts  | 35    | Eksplorator plików     | IPC listeners, file watchers                      |
| `library`  | LibraryModule  | LibraryModule.ts   | 34    | Biblioteka mediów      | IPC listeners, scan workers                       |
| `youtube`  | YouTubeModule  | YouTubeModule.ts   | 28    | YouTube integration    | IPC listeners, download workers                   |
| `settings` | SettingsModule | SettingsModule.ts  | 25    | Ustawienia             | IPC listeners                                     |
| `home`     | HomeModule     | HomeModule.ts      | 25    | Strona główna          | Drop zone listeners                               |

### 3.4 Przepływ Przełączenia Modułów

```
Użytkownik klika "Eksplorator" w Sidebar
  → router.push('/explorer')
  → router.afterEach → moduleManager.switchTo('explorer')
    → playerModule.deactivate()    // AWAITS: pauza audio, zapis pozycji, cleanup RAF
    → explorerModule.activate()    // załaduj pliki, pokaż UI
```

### 3.5 Zasada "Jeden Moduł na Raz"

**Wyjątek:** Muzyka może grać w tle gdy użytkownik nawiguje do innego widoku.

- `player.deactivate()` NIE pauzuje audio — jedynie ukrywa UI
- `player.deactivate(force: true)` — pauzuje i czyści (przy zamknięciu app)
- Player NIE dezaktywuje się przy przechodzeniu do eksploratora — działa w tle

---

## 4. Struktura Projektu

```
D:\Onda\
├── build/
│   └── entitlements.mac.plist
├── resources/
│   └── icon.png
├── scripts/
│   ├── install-ytdlp.ps1
│   └── install-ytdlp.sh
├── src/
│   ├── main/                           # === MAIN PROCESS (Node.js) ===
│   │   ├── index.ts                    # Okno, tray, skróty globalne, PiP (305 linii)
│   │   ├── pip-manager.ts              # PipManager singleton — PiP + preview (420 linii)
│   │   └── ipc/
│   │       └── handlers.ts             # Wszystkie handlery IPC (746 linii)
│   │
│   ├── preload/                        # === PRELOAD BRIDGE ===
│   │   ├── index.ts                    # contextBridge: window.api (122 linie)
│   │   └── index.d.ts                  # Type definitions (85 linii)
│   │
│   └── renderer/                       # === RENDERER PROCESS ===
│       ├── index.html                  # Main window HTML
│       ├── pip.html                    # PiP window HTML
│       └── src/
│           ├── main.ts                 # createApp + Pinia + Router (32 linie)
│           ├── App.vue                 # Root layout + theme engine (133 linie)
│           ├── env.d.ts
│           │
│           ├── modules/                # === MODUŁY (kluczowa warstwa) ===
│           │   ├── ModuleManager.ts    # Singleton: lifecycle, switchTo (83 linie)
│           │   ├── audioEngine.ts      # Singleton Web Audio API (431 linia)
│           │   ├── PlayerModule.ts     # Audio engine lifecycle (45 linii)
│           │   ├── ExplorerModule.ts   # File explorer lifecycle (35 linii)
│           │   ├── LibraryModule.ts    # Media library lifecycle (34 linie)
│           │   ├── YouTubeModule.ts    # YouTube integration lifecycle (28 linii)
│           │   ├── HomeModule.ts       # Home page lifecycle (25 linii)
│           │   └── SettingsModule.ts   # Settings lifecycle (25 linii)
│           │
│           ├── router/
│           │   └── index.ts            # Trasy z lazy loading (78 linii)
│           │
│           ├── stores/                 # Pinia stores
│           │   ├── player.ts           # Stan odtwarzacza (293 linie)
│           │   ├── settings.ts         # Ustawienia → electron-store (118 linii)
│           │   ├── explorer.ts         # Stan eksploratora (164 linie)
│           │   ├── library.ts          # Stan biblioteki (123 linie)
│           │   ├── ui.ts               # Stan UI (102 linie)
│           │   └── youtube.ts          # Stan YouTube (58 linii)
│           │
│           ├── composables/
│           │   ├── useMediaPlayer.ts   # Audio engine wrapper (75 linii)
│           │   ├── usePiP.ts           # PiP composable (94 linie)
│           │   └── useSubtitleRenderer.ts # JASSUB init + font map (375 linii)
│           │
│           ├── types/
│           │   ├── media.ts            # MediaFile, MediaMetadata (67 linii)
│           │   ├── settings.ts         # AppSettings (91 linia)
│           │   ├── explorer.ts         # FileItem, ViewMode (21 linia)
│           │   ├── youtube.ts          # YouTubeVideo, Subscription (65 linii)
│           │   └── subtitles.ts        # MkvFont, SubtitleTrack (16 linii)
│           │
│           ├── utils/
│           │   ├── constants.ts        # Formaty, presety EQ, motywy, defaults (179 linii)
│           │   ├── fileTypes.ts        # Rozszerzenia → ikony/kolory (49 linii)
│           │   └── formatters.ts       # Formatowanie czasu, rozmiaru (57 linii)
│           │
│           ├── components/
│           │   ├── layout/
│           │   │   ├── TitleBar.vue    # Custom titlebar + tabs (272 linie)
│           │   │   ├── TopMenu.vue     # Menu bar + address bar (136 linii)
│           │   │   ├── Sidebar.vue     # Nawigacja + resize + playlisty (208 linii)
│           │   │   ├── PlayerBar.vue   # Dolny pasek odtwarzacza (225 linii)
│           │   │   └── StatusBar.vue   # Dolny pasek statusu (67 linii)
│           │   │
│           │   └── player/
│           │       ├── AudioVisualizer.vue   # Canvas visualizer (bars/wave/radial) (125 linii)
│           │       ├── Equalizer.vue         # 10-pasmowy EQ + presety (139 linii)
│           │       ├── PlayerControls.vue    # Kontrolki: play, skip, speed, filter, volume (284 linie)
│           │       ├── PlayerOSD.vue         # OSD overlay (43 linie)
│           │       ├── PlayerTopBar.vue      # Górny pasek (back, PiP, fullscreen) (47 linii)
│           │       ├── QueuePanel.vue        # Kolejka + historia (293 linie)
│           │       └── SubtitleTrackSelector.vue # Wybór ścieżki napisów (94 linie)
│           │
│           ├── views/
│           │   ├── HomeView.vue        # Strona główna + drop zone (150 linii)
│           │   ├── PlayerView.vue      # Odtwarzacz video/audio fullscreen (606 linii)
│           │   ├── ExplorerView.vue    # Eksplorator plików (298 linii)
│           │   ├── LibraryView.vue     # Biblioteka mediów (188 linii)
│           │   ├── YouTubeView.vue     # YouTube (stub) (120 linii)
│           │   ├── DownloadsView.vue   # Pobierania (stub) (93 linie)
│           │   ├── SearchView.vue      # Wyszukiwanie (stub) (96 linii)
│           │   └── SettingsView.vue    # Ustawienia (774 linie)
│           │
│           ├── assets/
│           │   └── main.css            # Theme CSS variables (94 linie)
│           │
│           └── pip.ts                  # PiP bundle entry (JASSUB, listenery) (181 linia)
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
│  PlayerView / ExplorerView / LibraryView / ...      │
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
│  useMediaPlayer.ts → singletony module-level         │
│  usePiP.ts → IPC PiP controls                       │
│  useSubtitleRenderer.ts → JASSUB + font map          │
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
3. Pinia store: currentTrack = track, isPlaying = true
4. useMediaPlayer watch (currentTrack):
   a. srcMatches(audioEl, src) → false → loadTrack(track)
   b. loadTrack: audioEl.src = makeSrc(path)
   c. connectAudio(audioEl) → sourceNode → crossfadeGainA → EQ → gainNode → analyser
   d. ensureNextPreloaded() → nextAudioEl z następnym utworem z queue
   e. audioEl.play()
5. RAF loop (60fps): player.currentTime = audioEl.currentTime
6. PlayerBar: czyta player.currentTime/player.duration → progress bar
7. Gdy audioEl ended:
   a. handleEnded() → sprawdza repeat mode
   b. startGapless(): nextAudioEl ready → swap() (audioEl = nextAudioEl)
   c. Lub startCrossfade(): fade out A, fade in B → swap po duration
   d. ensureNextPreloaded() → następny z queue
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

| Kanał                    | Opis                                        |
| ------------------------ | ------------------------------------------- |
| `media:getMetadata`      | ID3 metadata (jsmediatags)                  |
| `media:getThumbnail`     | Embedded cover art (base64)                 |
| `media:getCover`         | Cover: `{ type: 'video' | 'image' | null, data }` |
| `media:getDuration`      | ffprobe duration (seconds)                  |
| `media:getReplayGain`    | ReplayGain tags                             |
| `media:toggleFavorite`   | Toggle ulubionego                           |
| `media:getFavorites`     | Pobranie mapy ulubionych                    |

### 6.3 Napisy

| Kanał                         | Opis                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `subtitles:listEmbedded`      | ffprobe: wbudowane ścieżki napisów                          |
| `subtitles:extractEmbedded`   | ffmpeg: ekstrakcja napisów (content + format)               |
| `subtitles:findExternal`      | Szukanie napisów obok pliku                                 |
| `subtitles:readFile`          | Odczyt pliku napisów                                        |
| `subtitles:extractAttachments`| mkvextract: czcionki z MKV → `{name, ext, data:number[]}[]` |

### 6.4 Dialogi

| Kanał               | Opis                  |
| ------------------- | --------------------- |
| `dialog:openFile`   | Dialog otwarcia pliku |
| `dialog:saveFile`   | Dialog zapisu pliku   |
| `dialog:openFolder` | Dialog wyboru folderu |
| `dialog:selectFile` | Zwykły select pliku   |

### 6.5 Picture-in-Picture

**Main process (`pip-manager.ts` — 420 linii):** `PipManager` singleton — zarządza ukrytym `BrowserWindow` (nigdy niszczony, tylko show/hide), preload wideo, synchronizacja czasu, napisy JASSUB.

| Kanał (invoke)        | Opis                                              |
| --------------------- | ------------------------------------------------- |
| `pip:start`           | Pokaż PiP: wyślij wideo + napisy + play + show    |
| `pip:stop`            | Zatrzymaj PiP: wyczyść + ukryj + powiadom renderer |
| `pip:preload`         | Preload: wyślij wideo + napisy, bez play/show     |
| `pip:loadtrack`       | Zmień utwór w PiP: wideo + napisy + play od 0     |
| `pip:updateSubtitle`  | Aktualizacja napisów w PiP (bez zmiany wideo)     |
| `pip:previewStart`    | Pokaż okno podglądu PiP (ustawienia)              |
| `pip:previewStop`     | Zamknij okno podglądu PiP                         |
| `pip:previewUpdate`   | Aktualizuj pozycję/rozmiar podglądu na żywo       |

| Kanał (on/send)       | Opis                                              |
| --------------------- | ------------------------------------------------- |
| `pip:videoSrc`        | main→PiP: ustaw src wideo                         |
| `pip:play`            | main→PiP: zacznij odtwarzanie od czasu            |
| `pip:pause`           | main→PiP: pauza (bez czyszczenia wideo)           |
| `pip:clear`           | main→PiP: pauza + usuń src + wyczyść napisy       |
| `pip:subtitle`        | main→PiP: załaduj napisy JASSUB                   |
| `pip:clearSubtitle`   | main→PiP: usuń napisy                             |
| `pip:requestTime`     | main→PiP: zapytaj o aktualny czas                 |
| `pip:timeUpdate`      | PiP→main: aktualny czas odtwarzania               |
| `pip:hidden`          | PiP→main: okno zamknięte przez użytkownika (X)    |
| `pip:ended`           | PiP→main/w renderer: wideo się zakończyło         |
| `pip:closed`          | main→renderer: PiP zamknięte + zapisany czas      |

**Renderer (`pip.ts` — 181 linia):** PiP bundle entry — JASSUB init, listenery IPC, close button, progress bar, timestamp display. Osobny HTML (`pip.html`).

**Composable (`usePiP.ts` — 94 linie):** `usePiP({onClosed, onEnded})` — interfejs renderera: `start()`, `stop()`, `preload()`, `loadTrack()`, `loadTrackFromCurrent()`, `updateSubtitle()`.

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

### 7.1 `player.ts` (293 linie) — Odtwarzacz

**Stan (ref):**

- `currentTrack: MediaFile | null`
- `queue: MediaFile[]` (max ~100)
- `history: MediaFile[]` (max 100)
- `isPlaying: boolean`
- `isMuted: boolean`
- `volume: number` (0-1, default 0.8)
- `currentTime: number` — synchronizowany z RAF loop
- `duration: number`
- `playbackRate: number`
- `shuffle: boolean`
- `repeat: 'none' | 'all' | 'one'`
- `crossfadeDuration: number`
- `queueVisible / equalizerVisible / visualizerVisible` — UI toggles
- `equalizerBands: number[10]`
- `visualizerStyle: 'bars' | 'wave' | 'radial'`
- `pipActive / pipTime`
- `coverCache: Map<string, CoverResult>` (reactive Vue 3 Map)
- `enrichTrack(track)` — async: ffprobe duration + cover cache

**Computed:** `hasTrack`, `progress`, `queueLength`

**Akcje:** `setTrack`, `playTrack`, `play/pause/togglePlay/stop/seek`, `setVolume/toggleMute`, `toggleShuffle/cycleRepeat`, `addToQueue/addToQueueMultiple/removeFromQueue/clearQueue/reorderQueue`, `nextTrack/prevTrack/playFromQueue/playFromHistory`, `toggleQueue/toggleEqualizer/toggleVisualizer`

**Persistencja:** Volume, shuffle, repeat, EQ bands, visualizer style → `settings.store` (auto-save)

### 7.2 `settings.ts` (118 linii) — Ustawienia

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

### 7.3 `explorer.ts` (164 linie) — Eksplorator

**State:** `currentPath`, `files: FileItem[]`, `selectedFiles: Set`, `viewMode`, `sortBy/sortOrder`, `history[]`

### 7.4 `library.ts` (123 linie) — Biblioteka

**State:** `tracks: MediaFile[]`, `playlists: Playlist[]`
**Computed:** `artists`, `albums`, `recentTracks`, `mostPlayed`

### 7.5 `ui.ts` (102 linie) — UI State

**State:** `sidebarExpanded/Width/Mode`, `topMenuVisible`, `statusBarVisible`, `playerBarVisible`, `contextMenu`, `notifications`

### 7.6 `youtube.ts` (58 linii) — YouTube (stub)

**State:** `searchResults`, `subscriptions`, `downloads`

---

## 8. Web Audio API — Architektura Dźwięku

### 8.1 Łańcuch sygnałowy

```
audioEl ──→ sourceNode ──→ crossfadeGainA ──→ [EQ: BiquadFilter ×10] ──→ gainNode ──→ analyserNode ──→ destination
nextAudioEl ──→ sourceNodeB ──→ crossfadeGainB ─┘
```

### 8.2 Singletony module-level (`audioEngine.ts` — 431 linia)

```typescript
let audioEl: HTMLAudioElement | null = null
let nextAudioEl: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let sourceNode: MediaElementAudioSourceNode | null = null
let sourceNodeB: MediaElementAudioSourceNode | null = null
let crossfadeGainA: GainNode | null = null
let crossfadeGainB: GainNode | null = null
let eqFilters: BiquadFilterNode[] = []
let gainNode: GainNode | null = null
let analyserNode: AnalyserNode | null = null
let rafId: number | null = null
let crossfadeTimer: ... | null = null
let isCrossfading = false
let isTrackEnding = false
```

### 8.3 Gapless Playback

```
1. ensureNextPreloaded(): nextAudioEl.src = następny utwór
2. current ended → handleEnded()
3. startGapless(): sprawdza nextAudioEl.readyState
   a. readyState >= 3 → swap() natychmiast
   b. readyState < 3 → czekaj na 'canplay' event → swap()
4. swap():
   a. audioEl.pause(), audioEl.removeAttribute('src')
   b. player.removeFromQueue(0), player.setTrack(nextTrack)
   c. audioEl = nextAudioEl, nextAudioEl = null
   d. sourceNode = sourceNodeB, sourceNodeB = null
   e. crossfadeGainA.gain = 0, crossfadeGainB.gain = 1
   f. audioEl.play()
   g. ensureNextPreloaded() → następny z queue
```

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

| Path         | Nazwa     | Widok          | Moduł               |
| ------------ | --------- | -------------- | ------------------- |
| `/`          | home      | HomeView       | home                |
| `/player`    | player    | PlayerView     | player              |
| `/explorer`  | explorer  | ExplorerView   | explorer            |
| `/library`   | library   | LibraryView    | library             |
| `/youtube`   | youtube   | YouTubeView    | youtube             |
| `/downloads` | downloads | DownloadsView  | youtube (downloads) |
| `/search`    | search    | SearchView     | home                |
| `/settings`  | settings  | SettingsView   | settings            |

Lazy loading: `() => import(...)` w routerze. Transition fade (`opacity 0.12s`) między widokami.

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
- [x] Preload bridge (122 linie, pełny type safety)
- [x] Main process + IPC handlers (305 + 746 linii)
- [x] Router z lazy loading (78 linii)
- [x] **Architektura modułowa** — ModuleManager + 6 modułów
- [x] **audioEngine.ts** — wyodrębniony silnik audio (431 linia)
- [x] **useMediaPlayer.ts** — refaktoryzacja na singleton wrapper (75 linii)
- [x] Router `afterEach` guard → `moduleManager.switchTo()` przy każdej nawigacji

### FAZA 1: UI Skeleton + Nawigacja — ✅ UKOŃCZONA

- [x] Custom TitleBar (tabs, drag, context menu) — 272 linie
- [x] TopMenu + TopBar — 136 linii
- [x] Sidebar (resize, collapse, playlisty, drag & drop) — 208 linii
- [x] PlayerBar (controls, progress, volume, mini player) — 225 linii
- [x] StatusBar — 67 linii
- [x] System motywów (dark, light, midnight, spotify) + dynamiczne CSS variables
- [x] Context menu globalny (App.vue)
- [x] Router + widoki + transitions

### FAZA 2: Odtwarzacz Multimediów — ✅ ~90% UKOŃCZONA

**Ukończono:**

- [x] Silnik audio: HTML5 Audio + Web Audio API (audioEngine.ts — 431 linia)
- [x] Gapless playback (preload + swap)
- [x] Crossfade (GainNode fade)
- [x] 10-pasmowy equalizer + presety + custom presets (Equalizer.vue — 139 linii)
- [x] Wizualizacja (bars, wave, radial) — Canvas + AnalyserNode (AudioVisualizer.vue — 125 linii)
- [x] Kolejka + historia (QueuePanel.vue — 293 linie)
- [x] Media Session API + Tray icon + Global shortcuts
- [x] Drag & Drop z systemu (Electron webUtils.getPathForFile)
- [x] Okładki (embedded, folder images, cover video matching)
- [x] Zapamiętywanie pozycji (audio/wideo, konfigurowalny czas)
- [x] ReplayGain / Normalization
- [x] Favorites + Playlists (IPC + electron-store)
- [x] Video player (fullscreen, PiP z pollingiem 250ms)
- [x] Napisy (SRT/VTT/ASS parser)
- [x] Napisy ASS renderowane przez JASSUB (wasm + worker, canvas overlay na video)
- [x] Wyciąganie czcionek z MKV (mkvextract) i podawanie binarnych do JASSUB
- [x] Lokalne fonty Windows (18 fontów w `public/fonts`) jako baza `availableFonts`
- [x] Google Fonts fallback (lfa-ponyfill `queryRemoteFonts`)
- [x] OSD overlay + sterowanie gestami + playback rate (PlayerOSD.vue — 43 linie)
- [x] **Cursor hide w fullscreen** — CSS `.hide-cursor *` z `cursor: none !important`
- [x] **Speed cycling ±** — kroki: 0.2–3.0x. Reset do 1.0x przy nowym utworze
- [x] **Video filters** — dropdown w kontrolierach. CSS filter na `<video>`. Reset do "none"
- [x] **Skip zones** — lewe/prawe 20% okna: hover -10s/+10s. Shift+strzałka = ±30s
- [x] **Keyboard shortcuts** — Spacja/K=play, ←/→=skip, ↑/↓=volume, M=mute, F=fullscreen, `<`/`>`=speed, 0=jump

**Skróty klawiszowe (player):**

| Klawisz      | Akcja           |
| ------------ | --------------- |
| Spacja / K   | Play / Pause    |
| ←            | Skip -10s (Shift: -30s) |
| →            | Skip +10s (Shift: +30s) |
| ↑            | Głośność +5%    |
| ↓            | Głośność -5%    |
| M            | Wycisz          |
| F            | Fullscreen      |
| `<`          | Prędkość -0.25x |
| `>`          | Prędkość +0.25x |
| 0            | Skok do 0:00    |
| MediaPlayPause | Play/Pause (systemowe) |
| MediaStop    | Stop (systemowe) |
| MediaNextTrack | Następny utwór |
| MediaPreviousTrack | Poprzedni utwór |

**Pozostało:**

- [ ] ID3 tags wewnątrz canvas visualizera
- [ ] Wiele presetów wizualizacji / custom presets
- [ ] Beat detection
- [ ] "Add to Queue" z biblioteki i YouTube
- [ ] Zapis kolejki do M3U
- [ ] Optymalizacja wielu cover videos
- [ ] System napisów → `sweet-subtitle` (patrz todo.md)

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

### FAZA 5: Eksplorator Plików — ❌ NIEZACZĘTA

- [ ] TreeView (drzewo folderów, lewy panel)
- [ ] AddressBar (breadcrumb, back/forward, edycja ścieżki)
- [ ] FileGrid / FileList (siatka + lista z sortowaniem po kolumnach)
- [ ] Menu kontekstowe (open, play, queue, properties, delete, rename)
- [ ] Drag & Drop (pomiędzy folderami, do kolejki, do playlisty)
- [ ] Marquee selection (wielokrotne zaznaczenie)

### FAZA 6: Ustawienia — ⏳ CZĘŚCIOWO (774 linie — największy plik!)

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

| Pakiet                        | Wersja    | Cel                                                                     |
| ----------------------------- | --------- | ----------------------------------------------------------------------- |
| `vue`                         | 3.5.25    | Framework UI                                                            |
| `vue-router`                  | 4.6.4     | Routing SPA                                                             |
| `pinia`                       | 3.0.4     | Stan globalny                                                           |
| `pinia-plugin-persistedstate` | 4.7.1     | Persistencja store                                                      |
| `@vueuse/core`                | 14.3.0    | Utility composables                                                     |
| `@lucide/vue`                 | 1.24.0    | Ikony SVG                                                               |
| `@tanstack/vue-virtual`       | 3.13.32   | Wirtualne listy                                                         |
| `electron-store`              | 11.0.2    | Persystencja ustawień (main process)                                    |
| `electron-updater`            | 6.3.9     | Auto-aktualizacje                                                       |
| `jsmediatags`                 | 3.9.7     | Odczyt ID3/FLAC/MP4 tags                                                |
| `@types/jsmediatags`          | 3.9.6     | Type definitions                                                        |
| `jassub`                      | 2.5.7     | Renderowanie napisów ASS (wasm + web worker, canvas overlay)            |
| `lfa-ponyfill`                | 1.1.1     | `queryLocalFonts`/`queryRemoteFonts` — Google Fonts fallback w Electron |
| `@electron-toolkit/preload`   | 3.0.2     | Preload utilities                                                       |
| `@electron-toolkit/utils`     | 4.0.0     | Main process utilities                                                  |

### 12.2 Dev

| Pakiet                              | Wersja    | Cel                  |
| ----------------------------------- | --------- | -------------------- |
| `electron`                          | 39.8.10   | Runtime desktopowy   |
| `electron-vite`                     | 5.0.0     | Build toolchain      |
| `electron-builder`                  | 26.0.12   | Packaging            |
| `vite`                              | 7.2.6     | Dev server / bundler |
| `@vitejs/plugin-vue`                | 6.0.2     | Vite Vue plugin      |
| `tailwindcss` + `@tailwindcss/vite` | 4.3.2     | Utility CSS          |
| `typescript` + `vue-tsc`            | 5.9.3 / 3.1.6 | Type checking   |
| `eslint`                            | 9.39.1    | Linting              |
| `eslint-plugin-vue`                 | 10.6.2    | Vue linting          |
| `vue-eslint-parser`                 | 10.2.0    | Vue SFC parser       |
| `@electron-toolkit/eslint-config-ts` | 3.1.0   | TS ESLint config     |
| `@electron-toolkit/eslint-config-prettier` | 3.0.0 | Prettier compat |
| `@electron-toolkit/tsconfig`        | 2.0.0     | Shared tsconfig      |
| `prettier`                          | 3.7.4     | Formatting           |
| `@types/node`                       | 22.19.1   | Node.js types        |

### 12.3 Zewnętrzne (nie-NPM)

| Narzędzie  | Cel                                   | Uwagi                                                                                                         |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FFmpeg     | Transkodowanie, napisy, metadane      | `choco install ffmpeg -y`                                                                                     |
| FFprobe    | Probing formatów, duration, cover     | Część FFmpeg                                                                                                  |
| MKVToolbox | Wyciąganie czcionek z załączników MKV | `choco install mkvtoolnix -y`; bin: `C:\Program Files\MKVToolNix\mkvextract.exe` (brak w PATH)              |
| yt-dlp     | Pobieranie YouTube                    | GitHub Releases binary → `{userData}/bin/yt-dlp.exe`                                                          |
| PowerShell | Wykrywanie dysków                     | Tylko Windows                                                                                                 |

### 12.4 Zależności Wzajemne (Internal)

```
App.vue
├── settings.load() → settings store → electron-store IPC
├── applyTheme() → constants.ts (THEME_PALETTES)
└── IPC listeners (pip:closed, pip:timeupdate)

ModuleManager
├── PlayerModule → audioEngine.ts + player store
├── ExplorerModule → explorer store + IPC fs:*
├── LibraryModule → library store + IPC fs:/media:*
├── YouTubeModule → youtube store
└── HomeModule → player store + IPC dialog:*

audioEngine.ts (singletony module-level)
├── player store (currentTrack, isPlaying, currentTime, ...)
├── settings store (playback.gaplessPlayback, crossfadeDuration, ...)
└── Web Audio API (AudioContext → GainNode → BiquadFilterNode → AnalyserNode)

useMediaPlayer.ts (75 linii — thin wrapper)
├── audioEngine.ts (deleguje wszystko)
└── player store ( Vue reaktywność)

useSubtitleRenderer.ts (375 linii)
├── JASSUB init (wasm, worker, fonts)
├── buildFontMap() → lokalne fonty + Google Fonts + MKV binary fonts
└── player store (loadEmbeddedSubtitle)

usePiP.ts (94 linie)
├── IPC pip:* (start, stop, preload, loadTrack, updateSubtitle)
└── callbacks (onClosed, onEnded)

Views → czytają store'y + wywołują akcje store
```

---

## 13. Kluczowe Pliki

| Plik                     | Linii | Znaczenie                                                                               |
| ------------------------ | ----- | --------------------------------------------------------------------------------------- |
| `audioEngine.ts`         | 431   | Singleton Web Audio API: gapless, crossfade, EQ, RAF loop, position memory             |
| `useSubtitleRenderer.ts` | 375   | JASSUB — inicjalizacja wasm/worker, buildFontMap (lokalne+Google+MKV), binary fonts     |
| `pip-manager.ts`         | 420   | PipManager singleton — PiP window + preview window, position/size, show/hide, IPC       |
| `handlers.ts`            | 746   | Main IPC — fs, metadata, FFmpeg, mkvextract, subtitles, dialogs, pip, settings, playlists |
| `PlayerView.vue`         | 606   | Odtwarzacz video/audio — fullscreen, PiP, napisy, EQ, cursor hide, speed, filters, shortcuts |
| `SettingsView.vue`       | 774   | Ustawienia — PiP preview, dependencies, shortcuts, playback, themes (największy plik!)  |
| `player.ts` (store)      | 293   | Player store — stan, kolejka, akcje, coverCache                                         |
| `QueuePanel.vue`         | 293   | Kolejka + historia (vuedraggable)                                                       |
| `PlayerControls.vue`     | 284   | Kontrolki: play/pause, skip, speed ±, filter dropdown, volume, time                     |
| `TitleBar.vue`           | 272   | Custom titlebar + tabs + context menu                                                   |
| `PlayerBar.vue`          | 225   | Dolny pasek — controls, progress (drag-to-seek), volume                                 |
| `Sidebar.vue`            | 208   | Nawigacja + resize + playlisty                                                          |
| `ExplorerView.vue`       | 298   | Eksplorator plików                                                                      |
| `main.ts` (main)         | 305   | Okno, tray, skróty globalne, PiP init                                                   |
| `pip.ts` (renderer)      | 181   | PiP bundle — JASSUB, listenery, progress bar, close button                              |
| `constants.ts`           | 179   | Formaty, presety EQ, motywy, defaults, shortcuts, playback defaults                     |

---

## 14. Konwencje Kodowe

### TypeScript

- Interface-first design (types/ folder)
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

## 15. Komendy

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

## 16. Konfiguracja Projektu

### electron.vite.config.ts

- Main/Preload: `externalizeDepsPlugin()`
- Renderer: `vue()` + `tailwindcss()` + custom `wasmMime()` plugin (Content-Type: application/wasm)
- Alias: `@renderer` → `src/renderer/src`
- Worker format: `es`
- Multi-page: `index.html` + `pip.html`
- `assetsInclude: ['**/*.wasm']`

### tsconfig.web.json

- `ignoreDeprecations: "6.0"` (dla `baseUrl` — TS 7.0 removal)
- Path alias: `@renderer/*` → `src/renderer/src/*`

### tsconfig.node.json

- `ignoreDeprecations: "5.0"`
- `types: ["electron-vite/node"]`

### electron-builder.yml

- NSIS (Windows), DMG (macOS), AppImage/snap/deb (Linux)
- asarUnpack: `resources/**`
- electron mirror: `npmmirror.com`

---

Ostatnia aktualizacja: 2026-07-18 (full analysis: accurate line counts, dependency versions, removed stale file references, updated IPC channels, config changes semi:true, tsconfig ignoreDeprecations, ESLint flat config)

---

## 17. Przyszłe ulepszenia

### 17.1 Edycja prostych napisów (SRT, VTT, SUB)

Formaty SRT, VTT i SUB nie posiadają złożonego systemu stylów jak ASS — mają tylko tekst, czas i podstawowe formatowanie.

**Co można edytować:**
- Tekst napisów
- Timing (start/end)
- Podstawowe formatowanie (bold/italic)

**Implementacja:**
- Prosty edytor textarea z podglądem na żywo
- Przesuwanie czasu (offset wszystkich napisów)
- Import/Export plików SRT/VTT

### 17.2 Własny renderer napisów (bez JASSUB)

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

### 17.3 Hybrydowy system napisów

Kombinacja obu podejść:
- ASS/SSA → JASSUB (zachowuje oryginalne style)
- SRT/VTT/SUB → własny renderer (pełna kontrola)
- Auto-detect formatu i wybranie odpowiedniego renderera
