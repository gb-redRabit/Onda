# Onda — Dokumentacja Projektu

## 1. Przegląd

**Onda** to desktopowy odtwarzacz muzyki i wideo zbudowany na Electron + Vue 3 + TypeScript + Tailwind CSS. Aplikacja obsługuje odtwarzanie lokalnych plików audio/video, eksplorację plików, bibliotekę mediów z metadanymi ID3, equalizer, wizualizację audio, kolejki odtwarzania, napisy wideo, Picture-in-Picture oraz system motywów.

**Kluczowa zasada architektury:** Aplikacja jest **modułowa** — każdy główny widok (player, explorer, library, youtube) jest niezależnym modulem z własnym cyklem życia. Centralny **ModuleManager** steruje przełączaniem modułów, gwarantując że poprzedni moduł **zakończy pracę całkowicie** przed startem następnego.

---

## 2. Stos Technologiczny

| Warstwa        | Technologia                                 |
| -------------- | ------------------------------------------- |
| Runtime        | Electron 39                                 |
| Framework UI   | Vue 3.5 (Composition API, `<script setup>`) |
| Język          | TypeScript                                  |
| Build          | electron-vite + Vite                        |
| CSS            | Tailwind CSS 4 (via `@tailwindcss/vite`)    |
| Stan           | Pinia 3 + pinia-plugin-persistedstate       |
| Routing        | vue-router 4 (hash history, lazy loading)   |
| Ikony          | @lucide/vue                                 |
| Drag & Drop    | vuedraggable (Sortable.js)                  |
| Virtual Lists  | @tanstack/vue-virtual                       |
| Utilitki       | @vueuse/core                                |
| Persystencja   | electron-store (ESM, main process)          |
| Metadane audio | music-metadata                              |
| Packaging      | electron-builder (NSIS/DMG/AppImage)        |
| Linting        | ESLint 9 (flat config) + eslint-plugin-vue  |
| Formatting     | Prettier                                    |

---

## 3. Architektura Modułowa

### 3.1 Koncepcja

Aplikacja składa się z **modułów** — niezależnych funkcjonalności, które mogą być włączane i wyłączane. Każdy moduł:

- Ma własny lifecycle: `init()` → `activate()` → `deactivate()` → `destroy()`
- Rejestruje się w ModuleManagerze przy starcie
- Nie może działać równocześnie z innym modułem tego samego typu
- Musi **całkowicie zwolnić zasoby** (event listenery, timery, audio context, DOM) przed aktywacją następnego modułu

### 3.2 ModuleManager (`src/renderer/src/modules/ModuleManager.ts`)

```typescript
interface AppModule {
  id: string // unikalny identyfikator ('player', 'explorer', 'library', ...)
  name: string // czytelna nazwa
  init(): void // jednorazowa inicjalizacja (rejestracja IPC, alloc zasobów)
  activate(context?: unknown): void // aktywacja modułu (pokaż UI, zacznij odtwarzanie)
  deactivate(): Promise<void> // dezaktywacja (zatrzymaj odtwarzanie, zwolnij timery, wyczyść stan UI)
  destroy(): Promise<void> // complete cleanup (opcjonalne, przy zamykaniu app)
  isActive(): boolean // stan aktywności
}
```

**ModuleManager** jako singleton:

```typescript
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

**Kluczowa metoda `switchTo()`:**

```
1. Jeśli target == active → return (nic do roboty)
2. Jeśli istnieje active → wywołaj active.deactivate() (AWAIT)
3. Czekaj aż deactivate się zakończy (Promise resolved)
4. Wywołaj target.activate(context)
5. Ustaw activeModuleId = target.id
```

**Gwarancja:** Nigdy nie ma dwóch aktywnych modułów jednocześnie. Przełączenie jest **atomowe** — albo stary się zakończył, albo nowy nie wystartował.

### 3.3 Lista Modułów

| ID         | Moduł          | Opis                   | Zasoby do zwolnienia                                                  |
| ---------- | -------------- | ---------------------- | --------------------------------------------------------------------- |
| `player`   | PlayerModule   | Odtwarzacz audio/video | AudioContext, RAF loop, audio/video elements, event listenery, timers |
| `explorer` | ExplorerModule | Eksplorator plików     | IPC listeners, file watchers                                          |
| `library`  | LibraryModule  | Biblioteka mediów      | IPC listeners, scan workers                                           |
| `youtube`  | YouTubeModule  | YouTube integration    | IPC listeners, download workers                                       |
| `settings` | SettingsModule | Ustawienia             | IPC listeners                                                         |
| `home`     | HomeModule     | Strona główna          | Drop zone listeners                                                   |

### 3.4 Przepływ Przełączenia Modułów

```
Użytkownik klika "Eksplorator" w Sidebar
  → router.push('/explorer')
  → ExplorerView.onMounted()
  → moduleManager.switchTo('explorer')
    → playerModule.deactivate()    // AWAITS: pauza audio, zapis pozycji, cleanup RAF
    → explorerModule.activate()    // załaduj pliki, pokaż UI
```

```
Użytkownik klika "Odtwarzacz" z utworem
  → playerModule.activate({ track })  // bez czekania na deactivate (player→player = skip)
  → router.push('/player')
  → PlayerView.onMounted() z kontekstem
```

```
Aplikacja zamykana
  → moduleManager.deactivateAll()
  →依次: player.destroy() → explorer.destroy() → ...
```

### 3.5 Zarządzanie Zasobami Audio (w Module Player)

**Kluczowe zasoby do zarządzania:**

| Zasob              | Typ                     | Inicjalizacja           | Cleanup                                           |
| ------------------ | ----------------------- | ----------------------- | ------------------------------------------------- |
| `audioEl`          | HTMLAudioElement        | `createAudioElement()`  | `pause()` + `removeAttribute('src')` + disconnect |
| `nextAudioEl`      | HTMLAudioElement        | `ensureNextPreloaded()` | j.w.                                              |
| `audioCtx`         | AudioContext            | `ensureAudioContext()`  | `suspend()` (nie `close()` — reuse)               |
| `sourceNode`       | MediaElementAudioSource | `connectAudio()`        | disconnect                                        |
| `sourceNodeB`      | MediaElementAudioSource | `connectAudioB()`       | disconnect                                        |
| `eqFilters[0..9]`  | BiquadFilterNode        | `ensureAudioContext()`  | disconnect                                        |
| `gainNode`         | GainNode                | `ensureAudioContext()`  | disconnect                                        |
| `analyserNode`     | AnalyserNode            | `ensureAudioContext()`  | disconnect                                        |
| `crossfadeGainA/B` | GainNode                | `ensureAudioContext()`  | reset gain do 0/1                                 |
| `rafId`            | requestAnimationFrame   | `startRafLoop()`        | `cancelAnimationFrame(rafId)`                     |
| `crossfadeTimer`   | setTimeout              | `startCrossfade()`      | `clearTimeout(crossfadeTimer)`                    |
| `playTimer`        | setTimeout              | `isPlaying` watcher     | `clearTimeout(playTimer)`                         |
| event listenery    | DOM events              | `setupListeners()`      | `removeEventListener()`                           |

**Reguła:** `deactivate()` musi:

1. Pauzować audio element
2. Anulować crossfade/gapless timers
3. Zerować RAF loop
4. Zapisywać pozycję odtwarzania
5. Ustawiać `isPlaying = false`
6. NIE zamykać AudioContext (wznowienie jest szybsze niż recreate)

### 3.6 Singletony vs Per-Instance

**Singletony (module-level):** `audioEl`, `nextAudioEl`, `audioCtx`, `sourceNode*`, `eqFilters`, `gainNode*`, `rafId`

Powód: Web Audio API nie pozwala na wiele `MediaElementAudioSourceNode` z tego samego elementu. Jeden AudioContext na aplikację.

**Per-Store (Pinia):** `currentTrack`, `queue`, `history`, `isPlaying`, `currentTime`, `duration`, `volume`

Powód: Stores żyją dłużej niż moduły. Player store zachowuje stan między przełączeniami (np. muzyka gra w tle gdy użytkownik jest w eksploratorze).

**Per-View (ref):** `showControls`, `isFullscreen`, `cursorHidden`, `subtitleTracks`

Powód: Te zmienne dotyczą wyłącznie UI danego widoku i nie powinny wpływać na inne moduły.

### 3.7 Zasada "Jeden Moduł na Raz"

**Ale z wyjątkiem:** Muzyka może grać w tle gdy użytkownik nawiguje do innego widoku.

Rozwiązanie: **Player to specjalny moduł "background-capable"**:

- `player.deactivate()` NIE pauzuje audio — jedynie ukrywa UI
- `player.deactivate(force: true)` — pauzuje i czyści (przy zamknięciu app)
- Inne moduły (explorer, library) DEAKTYWUJĄ się przed `player.activate()` (player zajmuje pełen ekran)
- Player NIE dezaktywuje się当 przechodzimy do eksploratora — działa w tle

```
Home → Explorer:  explorerModule.activate() (player continues in background)
Explorer → Player: playerModule.activate({fullScreen: true}) (explorer deactivated)
Player → Settings: settingsModule.activate() (player continues, PlayerBar visible)
```

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
│   │   ├── index.ts                    # Okno, tray, skróty globalne, PiP
│   │   └── ipc/
│   │       └── handlers.ts             # Wszystkie handlery IPC
│   │
│   ├── preload/                        # === PRELOAD BRIDGE ===
│   │   ├── index.ts                    # contextBridge: window.api
│   │   └── index.d.ts                  # Type definitions
│   │
│   └── renderer/                       # === RENDERER PROCESS ===
│       ├── index.html
│       └── src/
│           ├── main.ts                 # createApp + Pinia + Router
│           ├── App.vue                 # Root layout + theme engine + drag guard
│           ├── env.d.ts
│           │
│           ├── modules/                # === MODUŁY (kluczowa warstwa) ===
│           │   ├── ModuleManager.ts    # Singleton: lifecycle, switchTo, deactivateAll
│           │   ├── audioEngine.ts      # Singleton Web Audio API — gapless, crossfade, EQ, RAF
│           │   ├── PlayerModule.ts     # Audio engine lifecycle (background-capable)
│           │   ├── ExplorerModule.ts   # File explorer lifecycle
│           │   ├── LibraryModule.ts    # Media library lifecycle
│           │   ├── YouTubeModule.ts    # YouTube integration lifecycle
│           │   ├── HomeModule.ts       # Home page lifecycle
│           │   └── SettingsModule.ts   # Settings lifecycle
│           │
│           ├── router/
│           │   └── index.ts            # Trasy z lazy loading
│           │
│           ├── stores/                 # Pinia stores (stan przetrwania między modułami)
│           │   ├── player.ts           # Stan odtwarzacza (生存 across modules)
│           │   ├── settings.ts         # Ustawienia (persistowane do electron-store)
│           │   ├── explorer.ts         # Stan eksploratora
│           │   ├── library.ts          # Stan biblioteki
│           │   ├── ui.ts               # Stan UI (sidebar, context menu, notifications)
│           │   └── youtube.ts          # Stan YouTube
│           │
│           ├── composables/
│           │   └── useMediaPlayer.ts   # Audio engine (Web Audio API, gapless, crossfade)
│           │
│           ├── types/
│           │   ├── media.ts            # MediaFile, MediaMetadata, Playlist
│           │   ├── settings.ts         # AppSettings (appearance, playback, download, ...)
│           │   ├── explorer.ts         # FileItem, ViewMode, SortBy
│           │   └── youtube.ts          # YouTubeVideo, Subscription, DownloadTask
│           │
│           ├── utils/
│           │   ├── constants.ts        # Formaty, presety EQ, motywy, defaults
│           │   ├── fileTypes.ts        # Rozszerzenia → ikony/kolory/kategorie
│           │   ├── trackMetadata.ts    # enrichTrack(), resolveCover(), probeVideoDuration()
│           │   ├── fileDrop.ts         # getDroppedPaths(), processDroppedFiles()
│           │   ├── formatters.ts       # Formatowanie czasu, rozmiaru
│           │   └── subtitles.ts        # Parser SRT/VTT/ASS
│           │
│           ├── components/
│           │   ├── layout/
│           │   │   ├── TitleBar.vue    # Custom titlebar + tabs
│           │   │   ├── TopMenu.vue     # Menu bar + address bar
│           │   │   ├── Sidebar.vue     # Nawigacja + resize + playlisty
│           │   │   ├── PlayerBar.vue   # Dolny pasek odtwarzacza
│           │   │   └── StatusBar.vue   # Dolny pasek statusu
│           │   │
│           │   └── player/
│           │       ├── AudioBackground.vue   # Radial visualizer (tło)
│           │       ├── AudioNowPlaying.vue   # Now-playing bar
│           │       ├── AudioTrackList.vue    # Lista utworów z okładkami
│           │       ├── AudioVisualizer.vue   # Canvas visualizer (bars/wave/radial)
│           │       ├── Equalizer.vue         # 10-pasmowy EQ + presety
│           │       ├── PlayerControls.vue    # Kontrolki: play, skip, speed ±, filter, volume, time
│           │       ├── PlayerOSD.vue         # OSD overlay (ikony: play/pause/volume/speed)
│           │       ├── PlayerTopBar.vue      # Górny pasek (back, PiP, fullscreen)
│           │       ├── QueuePanel.vue        # Kolejka + historia (draggable)
│           │       ├── SubtitleTrackSelector.vue # Wybór ścieżki napisów
│           │       └── TrackArt.vue          # Okładka: video loop / obraz / ikona
│           │
│           ├── views/
│           │   ├── HomeView.vue        # Strona główna + drop zone
│           │   ├── PlayerView.vue      # Odtwarzacz video/audio fullscreen
│           │   ├── AudioFilesView.vue  # Przeglądarka plików audio
│           │   ├── ExplorerView.vue    # Eksplorator plików
│           │   ├── LibraryView.vue     # Biblioteka mediów
│           │   ├── YouTubeView.vue     # YouTube (stub)
│           │   ├── DownloadsView.vue   # Pobierania (stub)
│           │   ├── SearchView.vue      # Wyszukiwanie (stub)
│           │   └── SettingsView.vue    # Ustawienia
│           │
│           └── assets/
│               └── main.css
│
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json / tsconfig.web.json / tsconfig.node.json
├── eslint.config.mjs
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
│  → wywołują moduleManager.switchTo(id)              │
│  → czytają store'y (player.currentTrack, etc.)      │
│  → wywołują akcje store (player.setTrack(), etc.)   │
├─────────────────────────────────────────────────────┤
│                 MODULE MANAGER                       │
│  moduleManager.switchTo('player', {track})           │
│  → stary_moduł.deactivate() [AWAIT]                 │
│  → nowy_moduł.activate(context)                     │
├─────────────────────────────────────────────────────┤
│               PINIA STORES                           │
│  player.ts: currentTrack, isPlaying, queue, ...     │
│  settings.ts: appearance, playback, ...             │
│  explorer.ts: currentPath, files, ...               │
│  → persistencja: electron-store (main process)      │
├─────────────────────────────────────────────────────┤
│             COMPOSABLES                              │
│  useMediaPlayer.ts → singletony module-level         │
│  → audioEl, audioCtx, sourceNode, rafId, ...        │
│  → Web Audio API chain                               │
├─────────────────────────────────────────────────────┤
│             PRELOAD BRIDGE                           │
│  window.api.invoke(channel, ...args)                │
│  → ipcRenderer.invoke → main process                │
├─────────────────────────────────────────────────────┤
│             MAIN PROCESS                             │
│  handlers.ts: fs, media, settings, pip, ...         │
│  → Node.js fs, child_process (ffmpeg), etc.         │
└─────────────────────────────────────────────────────┘
```

### 5.2 Flow: Odtwarzanie utworu

```
1. Użytkownik: klik "Bounce.mp3" w AudioFilesView
2. AudioFilesView: player.setTrack(track)        // Pinia store
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

### 5.3 Flow: Przełączenie modułu

```
Użytkownik: eksplorator → odtwarzacz
1. router.push('/player')
2. PlayerView.onMounted()
3. moduleManager.switchTo('player', { track: currentTrack })
4. ModuleManager:
   a. explorerModule.deactivate() → zwolnij file watchers, ukryj UI
   b. playerModule.activate({ track }) → pokaż fullscreen player
5. PlayerView: setupVideo(track) / setup audio visualization
```

### 5.4 Flow: Napisy JASSUB (ASS z MKV)

```
1. Użytkownik włącza ścieżkę napisów (embedded ASS lub zewnętrzny .ass/.srt)
2. player.ts loadEmbeddedSubtitle(videoPath):
   a. extractEmbeddedSubtitle → ASS content (ffmpeg -c:s copy)
   b. extractSubtitleFonts(videoPath) → mkvextract wyciąga załączniki:
      - ffprobe: lista streamów attachment (index, filename)
      - mkvextract attachments <attId>:"out.ttf" per-attachment (spawnSync, shell:true)
      - odczyt binarny → { name, ext, data:number[] }[]
   → zwraca { content, format, fonts: MkvFont[] }
3. PlayerView: track.fonts = result.fonts
4. useSubtitleRenderer.loadSubtitleTrack(track):
   a. convertToAss(track) → ujednolicony ASS
   b. buildFontMap(assContent, mkvFonts):
      - extractAssFamilies() → rodziny z [V4+ Styles] Fontname
      - dostępne lokalne Windows fonty (availableFonts, lowercase keys)
      - dla brakujących: lfa-ponyfill queryRemoteFonts (Google, postscriptName)
        → URL.createObjectURL(blob) do availableFonts
   c. new JASSUB({
        subContent: assContent,
        workerUrl, wasmUrl (data:application/wasm;base64), modernWasmUrl,
        queryFonts: false,
        fonts: mkvFonts.map(f => new Uint8Array(f.data)),  // binarne z MKV
        availableFonts: fontMap,                            // lokalne + Google
        defaultFont: 'arial'
      })
```

**Kluczowe decyzje:**

- `queryFonts: false` — wewnętrzne query JASSUB (local/remote) zepsute w Electron (fonts.json MIME + brak self.queryLocalFonts)
- wasm ładowany jako `data:` URL (omija błąd MIME na `file://`/`app://`)
- worker przez `?worker&url` (Vite auto-blob, self-contained)
- binarne fonty z MKV → `fonts: Uint8Array[]` (JASSUB sam dopasowuje family name z ASS)
- custom PL fonty (np. "EraserDust CE PL") z MKV renderują się zamiast Arial fallbacku
- Google fallback tylko dla nazwanych fontów brakujących lokalnie i w MKV

**Dlaczego edycja stylów ASS nie ma sensu:**

ASS/SSA to złożony format z bogatym systemem stylów zawierającym: nazwy czcionek, rozmiary, kolory (z kanałem alpha), obwódki, cienie, pozycjonowanie (alignment 1-9), marginesy, obrót, skala, i wiele innych właściwości. Próba nadpisania tych stylów (np. przez `styleOverride` lub `setStyle`) psuje wygląd napisów, bo:

1. Oryginalne pliki ASS często mają wiele stylów (nie tylko "Default") — np. style dla postaci, efektów specjalnych, piosenek
2. Każdy styl może mieć różne czcionki, kolory i pozycjonowanie
3. JASSUB renderuje ASS zgodnie ze specyfikacją — modyfikacja stylów łamie kompatybilność
4. Nawet proste zmiany (rozmiar czcionki) mogą zmienić układ i czytelność

Dlatego edycja stylów ASS została porzucona — lepiej zostawić oryginalny styl z pliku.

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

| Kanał                          | Opis                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `media:getMetadata`            | ID3 metadata (music-metadata)                               |
| `media:getThumbnail`           | Embedded cover art (base64)                                 |
| `media:getCover`               | Cover result: `{ type: 'video'                              | 'image' | null, data }`— video = path for`<video>` tag |
| `media:getDuration`            | ffprobe duration (seconds)                                  |
| `media:getReplayGain`          | ReplayGain tags                                             |
| `media:findSubtitles`          | Szukanie napisów obok pliku                                 |
| `media:loadSubtitle`           | Odczyt pliku napisów                                        |
| `media:probeEmbeddedSubtitles` | ffprobe: wbudowane ścieżki                                  |
| `media:extractSubtitle`        | ffmpeg: ekstrakcja napisów                                  |
| `subtitles:extractAttachments` | mkvextract: czcionki z MKV → `{name, ext, data:number[]}[]` |
| `media:toggleFavorite`         | Toggle ulubionego                                           |
| `media:getFavorites`           | Pobranie mapy ulubionych                                    |

### 6.3 Dialogi

| Kanał               | Opis                  |
| ------------------- | --------------------- |
| `dialog:openFile`   | Dialog otwarcia pliku |
| `dialog:saveFile`   | Dialog zapisu pliku   |
| `dialog:openFolder` | Dialog wyboru folderu |
| `dialog:selectFile` | Zwykły select pliku   |

### 6.4 Picture-in-Picture

**Main process (`pip-manager.ts`):** `PipManager` singleton — zarządza ukrytym `BrowserWindow` (nigdy niszczony, tylko show/hide), preload wideo, synchronizacja czasu, napisy JASSUB.

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
| `pip:ended`           | PiP→main: wideo się zakończyło                    |
| `pip:closed`          | main→renderer: PiP zamknięte + zapisany czas      |
| `pip:ended`           | main→renderer: wideo w PiP się zakończyło         |

**Renderer (`pip.ts`):** Wpis PiP bundle — JASSUB, listenery `pip:videoSrc`/`pip:play`/`pip:pause`/`pip:clear`/`pip:subtitle`, close button → `pip:hidden`, progress bar, timestamp display.

**Composable (`usePiP.ts`):** `usePiP({onClosed, onEnded})` — interfejs renderera: `start()`, `stop()`, `preload()`, `loadTrack()`, `loadTrackFromCurrent()`, `updateSubtitle()`.

**Preview window (settings):** Osobny `BrowserWindow` (showPreview/hidePreview/updatePreview) — czarne tło "Podgląd PiP", alwaysOnTop, frameless, bez video. Sluzy do podglądu pozycji/rozmiaru PiP w ustawieniach. Całkowicie niezależny od głównego PiP — nie dotyka istniejącego okna PiP ani żadnych zasobów playera.

**Kluczowe zachowania:**

- **Preload:** Przy każdym nowym utworze (onMounted + currentTrack watcher), PiP dostaje `pip:videoSrc` w tle (ukryte okno). Po kliknięciu PiP — tylko `pip:play` (natychmiastowy start).
- **Porównanie ścieżek:** `show()` normalizuje URLe (decode + `file:///` strip + backslash + lowercase) i porównuje z `loadedSrc`. Jeśli takie samo → tylko play, bez przeładowania.
- **Hide vs Stop:** `hide()` wysyła `pip:pause` (nie `pip:clear`), zachowuje `loadedSrc`. `stop()` czyści wszystko.
- **Zmiana utworu w PiP:** `pip:ended` → renderer → `nextTrack()` → `currentTrack` watcher → `pip.loadTrack()` (PiP gra nowy) lub `pip.preload()` (PiP gotowy).
- **PiP aktywne + nowy plik:** `onMounted` wykrywa `pipActive=true` → `pip.loadTrack()` zamiast `pip.preload()` — PiP natychmiast przełącza wideo.

### 6.5 Ustawienia / Odtwarzanie / Playlista

| Kanał                                                   | Opis                  |
| ------------------------------------------------------- | --------------------- |
| `settings:get` / `settings:set`                         | Odczyt/zapis ustawień |
| `playback:setPosition` / `playback:clearPosition`       | Pozycja odtwarzania   |
| `playlist:list` / `playlist:create` / `playlist:delete` | CRUD playlist         |
| `playlist:addTrack` / `playlist:removeTrack`            | Zarządzanie utworami  |

### 6.6 Okno / Shell / FFmpeg / Zależności

| Kanał                                           | Opis                                             |
| ----------------------------------------------- | ------------------------------------------------ |
| `window:createChild` / `window:closeChild`      | Okna podrzędne                                   |
| `shell:openExternal` / `shell:showItemInFolder` | Otwieranie w systemie                            |
| `ffmpeg:check` / `ffmpeg:install`               | FFmpeg detection/instalacja                      |
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

### 7.1 `player.ts` — Odtwarzacz

**Stan (ref):**

- `currentTrack: MediaFile | null` — aktualny utwór
- `queue: MediaFile[]` — kolejka (max ~100)
- `history: MediaFile[]` — historia (max 100)
- `isPlaying: boolean`
- `isMuted: boolean`
- `volume: number` (0-1, default 0.8)
- `currentTime: number` — aktualny czas (synchronizowany z RAF loop)
- `duration: number` — czas trwania (z metadanych lub durationchange)
- `playbackRate: number`
- `shuffle: boolean`
- `repeat: 'none' | 'all' | 'one'`
- `crossfadeDuration: number`
- `queueVisible / equalizerVisible / visualizerVisible` — UI toggles
- `equalizerBands: number[10]`
- `visualizerStyle: 'bars' | 'wave' | 'radial'`
- `pipActive / pipTime`
- `coverCache: Map<string, CoverResult>` (reactive — Vue 3 Map reactivity)
- `enrichTrack(track)` — async: ffprobe duration + cover cache

**Computed:** `hasTrack`, `progress`, `queueLength`

**Akcje:** `setTrack`, `playTrack`, `play/pause/togglePlay/stop/seek`, `setVolume/toggleMute`, `toggleShuffle/cycleRepeat`, `addToQueue/addToQueueMultiple/removeFromQueue/clearQueue/reorderQueue`, `nextTrack/prevTrack/playFromQueue/playFromHistory`, `toggleQueue/toggleEqualizer/toggleVisualizer`

**Persistencja:** Volume, shuffle, repeat, EQ bands, visualizer style → `settings.store` (auto-save przy każdej zmianie)

### 7.2 `settings.ts` — Ustawienia

**Sekcje:** `appearance`, `playback`, `download`, `shortcuts`, `ffmpeg`, `subtitles`

**Playback settings (rozbudowane):**
- `playbackSpeed` — prędkość odtwarzania (0.2–3.0, default 1.0)
- `videoFilter` — filtr CSS na `<video>` (none, grayscale, sepia, contrast, brightness, saturate, invert, blur, hue-rotate)
- `cursorHide` — ukrywanie kursora w fullscreenie (default true)
- `cursorTimeout` — czas do ukrycia kursora w sekundach (default 3)
- `pipPosition` — pozycja okna PiP (bottom-right, bottom-left, top-right, top-left)
- `pipWidth` / `pipHeight` — rozmiar okna PiP (default 480×290)

**Zachowanie:** `playbackSpeed` i `videoFilter` resetują się do defaultów przy każdej zmianie utworu (onMounted + currentTrack watcher).

**Persystencja:** Cały obiekt → electron-store w main process (przez IPC `settings:get/set`)

### 7.3 `explorer.ts` — Eksplorator

**State:** `currentPath`, `files: FileItem[]`, `selectedFiles: Set`, `viewMode`, `sortBy/sortOrder`, `history[]`

### 7.4 `library.ts` — Biblioteka

**State:** `tracks: MediaFile[]`, `playlists: Playlist[]`
**Computed:** `artists`, `albums`, `recentTracks`, `mostPlayed`

### 7.5 `ui.ts` — UI State

**State:** `sidebarExpanded/Width/Mode`, `topMenuVisible`, `statusBarVisible`, `playerBarVisible`, `contextMenu`, `notifications`

### 7.6 `youtube.ts` — YouTube (stub)

**State:** `searchResults`, `subscriptions`, `downloads`

---

## 8. Web Audio API — Architektura Dźwięku

### 8.1 Łańcuch sygnałowy

```
audioEl ──→ sourceNode ──→ crossfadeGainA ──→ [EQ: BiquadFilter ×10] ──→ gainNode ──→ analyserNode ──→ destination
nextAudioEl ──→ sourceNodeB ──→ crossfadeGainB ─┘

Gapless swap: sourceNodeB przejmuje bycie sourceNode
Crossfade: crossfadeGainA.linearRampToValueAtTime(0), crossfadeGainB.linearRampToValueAtTime(1)
```

### 8.2 Singletony module-level

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

**Dlaczego singletony:** Web Audio API pozwala na jeden `MediaElementAudioSourceNode` per element audio. Jeden AudioContext na aplikację (wznowienie po suspend jest szybsze niż recreate).

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
| `/audio`     | audio     | AudioFilesView | player (audio mode) |
| `/explorer`  | explorer  | ExplorerView   | explorer            |
| `/library`   | library   | LibraryView    | library             |
| `/youtube`   | youtube   | YouTubeView    | youtube             |
| `/downloads` | downloads | DownloadsView  | youtube (downloads) |
| `/search`    | search    | SearchView     | —                   |
| `/settings`  | settings  | SettingsView   | settings            |

Lazy loading: `() => import(...)` w routerze. Transition fade między widokami.

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
- [x] Preload bridge
- [x] Main process + IPC handlers
- [x] Router z lazy loading
- [x] **Architektura modułowa** — ModuleManager + 6 modułów (player, explorer, library, youtube, home, settings)
- [x] **audioEngine.ts** — wyodrębniony silnik audio (Web Audio API, gapless, crossfade, EQ, RAF) jako singleton
- [x] **useMediaPlayer.ts** — refaktoryzacja na singleton wrapper delegujący do audioEngine
- [x] Router `afterEach` guard → `moduleManager.switchTo()` przy każdej nawigacji
- [x] Widoki zintegrowane z modulem (`onMounted → switchTo()`)

### FAZA 1: UI Skeleton + Nawigacja — ✅ UKOŃCZONA

- [x] Custom TitleBar (tabs, drag, context menu)
- [x] TopMenu + TopBar
- [x] Sidebar (resize, collapse, playlisty, drag & drop)
- [x] PlayerBar (controls, progress, volume, mini player)
- [x] StatusBar
- [x] System motywów (dark, light, midnight, spotify) + dynamiczne CSS variables
- [x] Router + widoki + transitions

### FAZA 2: Odtwarzacz Multimediów — ✅ ~90% UKOŃCZONA

**Ukończono:**

- [x] Silnik audio: HTML5 Audio + Web Audio API
- [x] Gapless playback (preload + swap)
- [x] Crossfade (GainNode fade)
- [x] 10-pasmowy equalizer + presety + custom presets + frequency response curve
- [x] Wizualizacja (bars, wave, radial) — Canvas + AnalyserNode
- [x] AudioBackground — radial visualizer jako tło
- [x] Kolejka + historia (vuedraggable)
- [x] Media Session API + Tray icon + Global shortcuts
- [x] Drag & Drop z systemu (Electron webUtils.getPathForFile)
- [x] Okładki (embedded, folder images, cover video matching)
- [x] TrackArt component
- [x] Zapamiętywanie pozycji (audio/wideo, konfigurowalny czas)
- [x] ReplayGain / Normalization
- [x] Favorites + Playlists (IPC + electron-store)
- [x] Video player (fullscreen, PiP z pollingiem 250ms)
- [x] Napisy (SRT/VTT/ASS parser 920 linii, wbudowane ścieżki)
- [x] Napisy ASS renderowane przez JASSUB (wasm + worker, canvas overlay na video)
- [x] Wyciąganie czcionek z MKV (mkvextract) i podawanie binarnych do JASSUB
- [x] Lokalne fonty Windows (18 fontów w `public/fonts`) jako baza `availableFonts`
- [x] Google Fonts fallback (lfa-ponyfill `queryRemoteFonts`) dla nazwanych fontów w ASS
- [x] OSD overlay + sterowanie gestami + playback rate
- [x] **Cursor hide w fullscreen** — ukrywa się po `cursorTimeout` sekundach bez ruchu myszy, przywraca na ruch. CSS `.hide-cursor *` wymusza `cursor: none !important` na wszystkich elementach (nie tylko kontenerze)
- [x] **Speed cycling ±** — przyciski `<`/`>` wokół Gauge icon, kroki: 0.2–3.0x. Reset do 1.0x przy nowym utworze
- [x] **Video filters** — dropdown w kontrolierach: none/grayscale/sepia/contrast/brightness/saturate/invert/blur/hue-rotate. CSS filter na `<video>`. Reset do "none" przy nowym utworze
- [x] **Skip zones** — lewe/prawe 20% okna: hover pokazuje -10s/+10s. Shift+strzałka = ±30s
- [x] **Keyboard shortcuts** — Spacja/K=play, ←/→=skip, ↑/↓=volume, M=mute, F=fullscreen, `<`/`>`=speed, 0=jump start. Skróty zdefiniowane w `constants.ts`

**Skróty klawiszowe (player):**

| Klawisz | Akcja |
|---------|-------|
| Spacja / K | Play / Pause |
| ← | Skip -10s (Shift: -30s) |
| → | Skip +10s (Shift: +30s) |
| ↑ | Głośność +5% |
| ↓ | Głośność -5% |
| M | Wycisz |
| F | Fullscreen |
| `<` | Prędkość -0.25x |
| `>` | Prędkość +0.25x |
| 0 | Skok do 0:00 |
| MediaPlayPause | Play/Pause (systemowe) |
| MediaStop | Stop (systemowe) |
| MediaNextTrack | Następny utwór |
| MediaPreviousTrack | Poprzedni utwór |

**Pozostało:**

- [ ] ID3 tags wewnątrz canvas visualizera
- [ ] Wiele presetów wizualizacji / custom presets
- [ ] Beat detection
- [ ] "Add to Queue" z biblioteki i YouTube
- [ ] Zapis kolejki do M3U
- [ ] Optymalizacja wielu cover videos
- [ ] System napisów → `sweet-subtitle` (5 kroków, patrz todo.md)

### FAZA 3: YouTube Integration — ❌ NIEZACZĘTA

- [ ] yt-dlp wrapper (main process)
- [ ] Wyszukiwanie (YouTubeSearch.vue)
- [ ] Widok kanału + Subskrypcje
- [ ] Download dialog (format, jakość, progress bar)
- [ ] Okładki z YouTube

### FAZA 4: Biblioteka Mediów — ❌ NIEZACZĘTA

- [ ] Skanowanie folderów + odczyt metadanych ID3
- [ ] Baza danych biblioteki (JSON/SQLite)
- [ ] Widoki:wg artysty, albumu, gatunku, roku (siatka + lista)
- [ ] Edycja tagów ID3
- [ ] Automatyczne metadane z MusicBrainz/Discogs

### FAZA 5: Eksplorator Plików — ❌ NIEZACZĘTA

- [ ] TreeView (drzewo folderów, lewy panel)
- [ ] AddressBar (breadcrumb, back/forward, edycja ścieżki)
- [ ] FileGrid / FileList (siatka + lista z sortowaniem po kolumnach)
- [ ] Menu kontekstowe (open, play, queue, properties, delete, rename)
- [ ] Drag & Drop (pomiędzy folderami, do kolejki, do playlisty)
- [ ] Marquee selection (wielokrotne zaznaczenie)

### FAZA 6: Ustawienia — ⏳ CZĘŚCIOWO

- [x] UI shell z sidebar + panels
- [x] Picture-in-Picture (pozycja, rozmiar)
- [x] Zapamiętywanie pozycji (audio/wideo, czas)
- [x] **Zależności** — Settings tab: status check (cache), instalacja FFmpeg (choco), instalacja yt-dlp (GitHub binary)
- [x] **PiP preview** — osobna zakładka PiP w ustawieniach: live editing (sliders pozycja/rozmiar natychmiast aktualizują okno), przycisk "Pokaż podgląd" (osobne okno BrowserWindow), auto-close przy opuszczeniu zakładki
- [x] **Skróty klawiszowe** — zakładka w ustawieniach, podgląd wszystkich skrótów playera + systemowych
- [x] **Odtwarzanie** — cursor hide (fullscreen), cursor timeout, prędkość domyślna, filtry wideo
- [ ] Theme: motyw, kolor akcentu, rozmiar czcionki, density, animacje, transparencja
- [ ] Odtwarzanie: crossfade time, normalization, gapless toggle, auto-pause
- [ ] Pobieranie: ścieżka, format, jakość, template nazwy, limit
- [ ] Skróty klawiszowe (edycja click+key combo, eksport/import, reset)
- [ ] Sieć: proxy (HTTP/HTTPS/SOCKS), limit prędkości, DNS cache, User-Agent
- [ ] Klucze API: YouTube Data v3, MusicBrainz, Discogs, Last.fm
- [ ] Aktualizacje: auto-check, harmonogram, changelog, tło

### FAZA 7: Zaawansowane Funkcje — ❌ NIEZACZĘTA

- [ ] Wielo-okienność (osobny eksplorator)
- [ ] Menu kontekstowe globalne (dostosowane do elementu)
- [ ] Tray icon (dynamiczny based on state, tooltip z utworem)
- [ ] Command palette (Ctrl+K — wyszukiwanie w entire app)
- [ ] Lista wirtualna (100k+ elementów bez lagów)
- [ ] System wtyczek (manifest, loader, API hooks, store)

### FAZA 8: Integracja z Systemem — ❌ NIEZACZĘTA

- [ ] Auto-update (electron-updater — pobieranie, progress, restart)
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

| Pakiet                        | Cel                                                                     |
| ----------------------------- | ----------------------------------------------------------------------- |
| `vue`                         | Framework UI                                                            |
| `vue-router`                  | Routing SPA                                                             |
| `pinia`                       | Stan globalny                                                           |
| `pinia-plugin-persistedstate` | Persistencja store                                                      |
| `@vueuse/core`                | Utility composables                                                     |
| `@lucide/vue`                 | Ikony SVG                                                               |
| `electron-store`              | Persystencja ustawień (main process)                                    |
| `electron-updater`            | Auto-aktualizacje                                                       |
| `music-metadata`              | Odczyt ID3/FLAC/MP4 tags                                                |
| `vuedraggable`                | Drag & drop listy (Sortable.js)                                         |
| `@tanstack/vue-virtual`       | Wirtualne listy                                                         |
| `@electron-toolkit/preload`   | Preload utilities                                                       |
| `@electron-toolkit/utils`     | Main process utilities                                                  |
| `jassub`                      | Renderowanie napisów ASS (wasm + web worker, canvas overlay)            |
| `lfa-ponyfill`                | `queryLocalFonts`/`queryRemoteFonts` — Google Fonts fallback w Electron |

### 12.2 Dev

| Pakiet                              | Cel                  |
| ----------------------------------- | -------------------- |
| `electron`                          | Runtime desktopowy   |
| `electron-vite`                     | Build toolchain      |
| `electron-builder`                  | Packaging            |
| `vite`                              | Dev server / bundler |
| `@vitejs/plugin-vue`                | Vite Vue plugin      |
| `tailwindcss` + `@tailwindcss/vite` | Utility CSS          |
| `typescript` + `vue-tsc`            | Type checking        |
| `eslint` + `eslint-plugin-vue`      | Linting              |
| `prettier`                          | Formatting           |

### 12.3 Zewnętrzne (nie-NPM)

| Narzędzie  | Cel                                   | Uwagi                                                                                                         |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FFmpeg     | Transkodowanie, napisy, metadane      | Instalacja via `choco install ffmpeg -y`                                                                      |
| FFprobe    | Probing formatów, duration, cover     | Część FFmpeg (tego samego pakietu)                                                                            |
| MKVToolbox | Wyciąganie czcionek z załączników MKV | Instalacja via `choco install mkvtoolnix -y`; bin: `C:\Program Files\MKVToolNix\mkvextract.exe` (brak w PATH) |
| yt-dlp     | Pobieranie YouTube                    | Instalacja via GitHub Releases binary → `{userData}/bin/yt-dlp.exe`                                           |
| PowerShell | Wykrywanie dysków                     | Tylko Windows                                                                                                 |

### 12.4 Zależności Wzajemne (Internal)

```
App.vue
├── settings.load() → settings store → electron-store IPC
├── player.hydrateFromSettings() → player store
├── applyTheme() → constants.ts (THEME_PALETTES)
└── IPC listeners (pip:closed, pip:timeupdate)

ModuleManager
├── PlayerModule → useMediaPlayer.ts + player store
├── ExplorerModule → explorer store + IPC fs:*
├── LibraryModule → library store + IPC fs:/media:*
├── YouTubeModule → youtube store
└── HomeModule → player store + IPC dialog:*

useMediaPlayer.ts (composable — singletony)
├── player store (currentTrack, isPlaying, currentTime, ...)
├── settings store (playback.gaplessPlayback, crossfadeDuration, ...)
├── enrichTrack() → trackMetadata.ts → IPC media:*
└── Web Audio API (AudioContext → GainNode → BiquadFilterNode → AnalyserNode)

Views → czytają store'y + wywołują akcje store
```

---

## 13. Kluczowe Pliki

| Plik                     | Linii | Znaczenie                                                                               |
| ------------------------ | ----- | --------------------------------------------------------------------------------------- |
| `audioEngine.ts`         | ~300  | **NOWY** — singleton Web Audio API: gapless, crossfade, EQ, RAF loop, position memory   |
| `useMediaPlayer.ts`      | ~90   | **REF** — singleton wrapper delegujący do audioEngine, zapewnia Vue reaktywność         |
| `ModuleManager.ts`       | ~90   | **NOWY** — lifecycle modułów, switchTo (async deactivate→activate), deactivateAll       |
| `PlayerModule.ts`        | ~50   | **NOWY** — background-capable: deactivate() nie pauzuje audio                           |
| `handlers.ts`            | ~795  | **Main IPC** — fs, metadata, FFmpeg, mkvextract, dialogs, pip, settings, playlists      |
| `subtitles.ts`           | ~920  | Parser SRT/VTT/ASS z tagami HTML i ASS                                                  |
| `useSubtitleRenderer.ts` | ~315  | **JASSUB** — inicjalizacja wasm/worker, buildFontMap (lokalne+Google+MKV), binary fonts |
| `player.ts`              | ~310  | Player store — stan, kolejka, akcje, loadEmbeddedSubtitle(fonts z MKV)                  |
| `PlayerView.vue`         | ~600  | Odtwarzacz video/audio — fullscreen, PiP, napisy, EQ toggle, cursor hide, speed cycling, skip zones, video filters, keyboard shortcuts |
| `pip-manager.ts`         | ~370  | PipManager singleton — PiP window + preview window, position/size, show/hide, IPC        |
| `PlayerControls.vue`     | ~270  | Kontrolki playera: play/pause, skip, speed ±, filter dropdown, volume, time display     |
| `PlayerBar.vue`          | ~500  | Dolny pasek — controls, progress (drag-to-seek), volume                                 |
| `constants.ts`           | ~200  | Formaty, presety EQ, motywy, defaults, shortcuts, playback defaults                     |
| `trackMetadata.ts`       | ~220  | enrichTrack(), resolveCover() — metadane + okładki                                      |

---

## 14. Konwencje Kodowe

### TypeScript

- Interface-first design (types/ folder)
- No `any` — preferowane `unknown` + type guards

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
- Dynamiczne CSS variables przez JS (applyTheme)
- Brak scoped CSS (exception: page transitions)

### Module System

- Każdy moduł rejestruje się w ModuleManager przy init
- `switchTo()` → deactivate old (AWAIT) → activate new
- Player jest background-capable (nie pauzuje przy nawigacji)
- `deactivate()` zwalnia UI, `deactivate(force: true)` zatrzymuje audio

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

Ostatnia aktualizacja: 2026-07-18 (PiP module complete; edycja stylów ASS porzucona; player UI: cursor hide, speed cycling, video filters, skip zones, keyboard shortcuts; PiP settings preview; cursor fix CSS !important)

---

## 16. Przyszłe ulepszenia

### 16.1 Edycja prostych napisów (SRT, VTT, SUB)

Formaty takie jak SRT, VTT i SUB nie posiadają złożonego systemu stylów jak ASS — mają tylko tekst, czas i podstawowe formatowanie (pogrubienie, kursywa). Dlatego edycja tych formatów jest realna i nie psuje wyglądu.

**Co można edytować:**
- Tekst napisów
- Timing (start/end)
- Podstawowe formatowanie (bold/italic)

**Implementacja:**
- Prosty edytor textarea z podglądem na żywo
- Przesuwanie czasu (offset wszystkich napisów)
- Import/Export plików SRT/VTT

### 16.2 Własny renderer napisów (bez JASSUB)

JASSUB jest świetny do renderowania ASS/SSA z ich złożonymi stylami, ale dla prostych formatów (SRT, VTT) jest overkill. Własny renderer mógłby:

**Zalety:**
- Lepsza kontrola nad wyglądem
- Brak zależności od WebAssembly
- Łatwiejsza customizacja stylów
- Szybsze ładowanie dla prostych formatów

**Implementacja:**
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

### 16.3 Hybrydowy system napisów

Kombinacja obu podejść:
- ASS/SSA → JASSUB (zachowuje oryginalne style)
- SRT/VTT/SUB → własny renderer (pełna kontrola)
- Auto-detect formatu i wybranie odpowiedniego renderera
