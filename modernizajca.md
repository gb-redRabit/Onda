# Obecna modernizacja Onda — szczegółowy plan

## Architektura aplikacji

### Stos technologiczny
- **Electron 39.8.10** — okno główne + child windows (PiP, audio window)
- **Vue 3.5.25 + TypeScript 5.9.3** — frontend SPA
- **Pinia 3.0.4** — stan (player, settings, library, ui)
- **Tailwind CSS 4.3.2** — styling
- **JASSUB 2.5.7** — napisy ASS z czcionkami z MKV
- **Web Audio API** — EQ (10 pasm BiquadFilter), crossfade, AnalyserNode
- **electron-vite** — build (main + preload + renderer)

### Struktura procesów

```
Main Process (src/main/)
├── index.ts                    — init okna, tray, skróty, IPC handlers
├── pip-manager.ts              — Picture-in-Picture (zawsze na wierzchu)
├── audio-window-manager.ts     — Floating audio window (zawsze na wierzchu)
├── splash-manager.ts           — Splash screen
├── ipc/handlers.ts             — FS, dialogi, media metadata, napisy, dependency check
└── electron.vite.config.ts     — build config (3 entry points: index, pip, audio-window)

Renderer Process (src/renderer/)
├── index.html                  — główne okno
├── pip.html                    — PiP okno
├── audio-window.html           — audio floating window
├── splash.html                 — splash screen
└── src/
    ├── main.ts                 — Vue app bootstrap
    ├── App.vue                 — root component, theme, layout
    ├── router/index.ts         — 9 routów + afterEach → moduleManager.switchTo()
    ├── modules/
    │   ├── ModuleManager.ts    — singleton zarządzający lifecycle modułów
    │   ├── PlayerModule.ts     — init audioEngine, activate/deactivate
    │   ├── audioEngine.ts      — Web Audio API, EQ, crossfade, RAF loop
    │   ├── ExplorerModule.ts   — nawigacja plików
    │   ├── LibraryModule.ts    — skanowanie biblioteki
    │   ├── HomeModule.ts       — strona główna
    │   ├── SettingsModule.ts   — ustawienia
    │   └── YouTubeModule.ts    — YouTube
    ├── composables/
    │   ├── useMediaPlayer.ts   — bridge: player store → audioEngine ($onAction)
    │   ├── useSubtitleRenderer.ts — JASSUB napisy
    │   ├── usePiP.ts           — IPC do pip-manager
    │   └── useExplorer.ts      — nawigacja plików
    ├── stores/
    │   ├── player.ts           — currentTrack, queue, history, isPlaying, volume, EQ bands
    │   ├── settings.ts         — appearance, playback, download, audioWindow, shortcuts
    │   ├── library.ts          — tracks, playlists, scan
    │   └── ui.ts               — sidebar, top menu, context menu
    ├── views/
    │   ├── HomeView.vue        — / (HomeModule)
    │   ├── LibraryView.vue     — /library (LibraryModule)
    │   ├── ExplorerView.vue    — /explorer (ExplorerModule)
    │   ├── PlayerView.vue      — /player (PlayerModule) — wideo
    │   ├── AudioView.vue       — /audio (PlayerModule) — audio
    │   ├── SettingsView.vue    — /settings (SettingsModule)
    │   ├── SearchView.vue      — /search (HomeModule)
    │   ├── YouTubeView.vue     — /youtube (YouTubeModule)
    │   └── DownloadsView.vue   — /downloads (YouTubeModule)
    └── components/
        ├── audio/
        │   ├── AudioVisualizer.vue  — canvas 4 style (bars/wave/radial/circular)
        │   └── AudioLayout.vue      — wrapper QueuePanel + Equalizer
        └── player/
            ├── PlayerControls.vue   — kontrolki wideo (play, skip, speed, filters, volume)
            ├── PlayerOSD.vue        — overlay z informacjami
            ├── PlayerTopBar.vue     — górny pasek (PiP, fullscreen, back)
            ├── QueuePanel.vue       — lista odtwarzania
            └── Equalizer.vue        — korektor graficzny 10 pasm

Preload (src/preload/)
├── index.ts                    — contextBridge: api.invoke/send/on + convenience methods
└── index.d.ts                  — deklaracje typów OndaAPI
```

### Lifecycle initialization (kolejność w main.ts)

```
app.whenReady()
  1. electronApp.setAppUserModelId()
  2. splash.create()                    —splash.html
  3. registerIPC()                      — fs, dialog, media, subtitle handlers
  4. mainWindow = createWindow()        — główne okno (show: false)
  5. pipManager.setMainWindow(mainWindow)
  6. pipManager.init()                  — tworzy pip.html BrowserWindow (show: false)
  7. setupTray()                        — tray z kontekstem
  8. registerGlobalShortcuts()          — MediaPlayPause, MediaNextTrack, itp.
  9. audioWindowManager.setMainWindow(mainWindow)
 10. audioWindowManager.init()          — tworzy audio-window.html BrowserWindow (show: false) + registerIpc()
 11. Rejestracja IPC handlerów (pip:start, pip:stop, audioWindow:start, itp.)
 12. splash.fadeAndClose() → mainWindow.show()
```

### Router → Module mapping

```
/home        → HomeModule
/library     → LibraryModule
/explorer    → ExplorerModule
/youtube     → YouTubeModule
/downloads   → YouTubeModule
/search      → HomeModule
/settings    → SettingsModule
/player      → PlayerModule
/audio       → PlayerModule    ← oba route'y audio/wideo → ten sam moduł
```

**`router.afterEach`** wywołuje `moduleManager.switchTo(moduleId)` co deaktiwuje poprzedni moduł i aktywuje nowy.

### AudioEngine — łańcuch sygnałowy

```
HTMLAudioElement → sourceNode → crossfadeGainA → [EQ BiquadFilter ×10] → gainNode → analyserNode → destination
HTMLVideoElement → videoSourceNode → [EQ BiquadFilter ×10] → gainNode → analyserNode → destination
```

- `audioEngine.init()` wywoływane z `PlayerModule.init()` — tworzy AudioContext, EQ, RAF loop
- `audioEngine.loadTrack()` — ustawia src, podłącza do łańcucha, ustawia gain
- `audioEngine.play()/pause()` — odtwarza/wstrzymuje HTMLAudioElement
- `audioEngine.connectVideoToGraph(el)` — podłącza `<video>` do tego samego łańcucha EQ

### useMediaPlayer — bridge store → audioEngine

- **`_initialized`** (module-level) — setup wykonuje się RAZ niezależnie ile komponentów wywoła
- **`$onAction` listener** na Pinia store — nasłuchuje `setTrack`, `togglePlay`, `play`, `pause`, `nextTrack`, `prevTrack`
- **Monkey-patch `audioEngine.loadTrack`** — po załadowaniu aktualizuje shared `mediaEl` ref
- **Inicjalizacja** — `useMediaPlayer()` wywoływane z `App.vue` (zawsze aktywne od startu)

---

## FAZA 1 — Widok Audio Player 

### Pliki zmodyfikowane / utworzone:

| Plik | Operacja | Opis |
|---|---|---|
| `types/media.ts` | modyfikacja | Dodano `isFavorite?: boolean` do `MediaFile` |
| `stores/player.ts` | modyfikacja | Dodano `audioViewActive`, `toggleFavorite(path)`, `loadCover()` w `setTrack()`, `clearQueue()` w `setTrack()` dla wideo |
| `router/index.ts` | modyfikacja | Dodano route `/audio` → `AudioView.vue` |
| `components/audio/AudioVisualizer.vue` | **NOWY** | Canvas z 4 stylami wizualizacji (bars/wave/radial/circular), AnalyserNode z audioEngine |
| `components/audio/AudioLayout.vue` | **NOWY** | Wrapper dla QueuePanel + Equalizer |
| `views/AudioView.vue` | **NOWY** | Pełny audio player (~442 linii): 3 layouty, kontrolki, EQ, queue, favorites, fullscreen, klawiatura |
| `App.vue` | modyfikacja | `isAudioRoute` computed, warunkowe ukrywanie QueuePanel/Equalizer/PlayerBar/QueuePanel na `/audio`, `useMediaPlayer()` init, `audioWindow:*` IPC listeners |
| `views/PlayerView.vue` | modyfikacja | Audio track → `router.replace('/audio')` zamiast `router.back()` |
| `components/layout/PlayerBar.vue` | modyfikacja | Ukryty na `/audio` via warunek w App.vue, naprawiony brakujący import `Maximize2` |
| `views/ExplorerView.vue` | modyfikacja | `playTrack()` helper: wideo → `/player`, audio → `/audio` |
| `views/HomeView.vue` | modyfikacja | `playTrack()` helper: wideo → `/player`, audio → `/audio` |
| `views/LibraryView.vue` | modyfikacja | `playTrack()` helper: wideo → `/player`, audio → `/audio` |
| `views/SearchView.vue` | modyfikacja | `playTrack()` helper: wideo → `/player`, audio → `/audio` |
| `components/player/QueuePanel.vue` | modyfikacja | `playTrack()` helper + `useRouter` import |
| `components/layout/TopMenu.vue` | modyfikacja | Warunkowy routing audio/wideo |
| `modules/audioEngine.ts` | modyfikacja | `connectVideo(el)`, `connectVideoToGraph(el)`, `setVolume()` via gainNode, `loadTrack()` ustawia gainNode |
| `composables/useMediaPlayer.ts` | modyfikacja | `$onAction` nasłuchuje `setTrack` (audio→loadTrack, video→pause), `togglePlay/play/pause` → play/pause audioEngine, auto-show audio window, IPC do floating window |

### Co działa po fazie 1:

1. **Odtwarzanie audio** — kliknięcie pliku audio w Explorer/Home/Library/Search otwiera `/audio` z pełnymi kontrolkami
2. **3 layouty** — cover (duża okładka), visualizer (canvas bars/wave/radial/circular), combined (okładka + wizualizacja)
3. **Kontrolki** — play/pause, skip ±10/30s, prev/next, shuffle, repeat (none/all/one), progress bar, głośność, mute
4. **Ulubione** — Heart button, `isFavorite` w MediaFile
5. **EQ** — Equalizer dostępny z AudioView, 10 pasm BiquadFilter, preset (flat/pop/rock/jazz/classical/bass/treble/vocal)
6. **Queue** — QueuePanel z listą odtwarzania, drag & drop, usuwanie
7. **Fullscreen** — klawisz F, ukrywanie kontroli
8. **Klawiatura** — Space/K=play, strzałki=skip/volume, M=mute, F=fullscreen
9. **EQ na wideo** — `<video>` element podłączony do tego samego łańcucha EQ co audio
10. **Routing** — poprawne przekierowanie giữa `/audio` i `/player` w obie strony
11. **PlayerBar** — ukryty gdy jesteśmy na `/audio`

---

## FAZA 2 — Okno Audio (Floating Window) 

### Pliki zmodyfikowane / utworzone:

| Plik | Operacja | Opis |
|---|---|---|
| `src/main/audio-window-manager.ts` | **NOWY** | Klasa `AudioWindowManager` (~290 linii): createWindow (start), show/hide, showPreview/hidePreview, updateTrackData, updateLayout, IPC (togglePlay→main, prevTrack→main, nextTrack→main, close→main, closed→main) |
| `src/renderer/audio-window.html` | **NOWY** | HTML okna audio: cover, title, artist, prev/play/next buttons, close button, CSS glassmorphism |
| `src/renderer/src/audio-window.ts` | **NOWY** | Renderer IPC: nasłuchiwanie `audioWindow:trackData`, `audioWindow:layout`, buttons → send IPC |
| `src/renderer/src/types/settings.ts` | modyfikacja | Dodano `AudioWindowSettings { enabled, position, width, height }` do `AppSettings` |
| `src/renderer/src/utils/constants.ts` | modyfikacja | Dodano `DEFAULT_AUDIO_WINDOW` |
| `src/renderer/src/stores/settings.ts` | modyfikacja | Dodano `audioWindow` ref, `updateAudioWindow()`, load/save |
| `src/renderer/src/views/SettingsView.vue` | modyfikacja | Nowa zakładka "Okno audio": toggle auto-open, preview, pozycja, szerokość/wysokość |
| `src/preload/index.ts` | modyfikacja | 7 nowych metod: `audioWindowStart/Stop/UpdateTrack/UpdateLayout/PreviewStart/PreviewStop/PreviewUpdate` |
| `src/preload/index.d.ts` | modyfikacja | Deklaracje typów dla 7 metod |
| `src/main/index.ts` | modyfikacja | AudioWindowManager init + 7 handlerów IPC + destroy |

### Co działa po fazie 2:

1. **Okno startuje z aplikacją** — `audioWindowManager.init()` wywoływane w main.ts, tworzy ukryte okno z `audio-window.html`
2. **Auto-pokazywanie** — gdy `settings.audioWindow.enabled = true` i app jest w tle (`document.hidden`), okno automatycznie się pokazuje (via `useMediaPlayer` → `window.api.audioWindowStart()`)
3. **Sync danych** — tytuł, artysta, okładka, play/pause sync między głównym oknem a floating window
4. **Kontrolki** — prev/play/next w floating window → IPC do głównego okna → `player.togglePlay()`/`player.nextTrack()`/`player.prevTrack()`
5. **Zamykanie** — X w floating window → chowa okno, powiadamia główne okno
6. **Preview w ustawieniach** — przycisk "Pokaż podgląd" tworzy małe okno preview z placeholderem, live-update pozycji/rozmiaru
7. **Ustawienia** — toggle auto-open, pozycja (4 rogi), szerokość (280-600px), wysokość (80-200px)
8. **Zamykanie przy wideo** — gdy odtwarzany jest plik wideo, audio window się chowa
9. **Kolejka czyszczona** — `setTrack()` z wideo → `queue.value = []`

### IPC flow (audio window):

```
Renderer (audio-window.ts) → IPC send('audioWindow:togglePlay')
  → Main (audio-window-manager.ts: registerIpc) → ipcMain.on('audioWindow:togglePlay')
  → mainWindow.webContents.send('audioWindow:togglePlay')
  → Renderer (App.vue: onMounted listener) → player.togglePlay()
```

---

## FAZA 3 — Połączenie AudioView z Floating Window 

### Status: Częściowo zrobione

### Co już działa (poprawione w sesji 2):
1. **prevTrack/nextTrack** — teraz prawidłowo ładowały utwory w audioEngine (B9, B10)
2. **Auto-show** — okno audio pokazuje się tylko gdy app jest w tle (B11)
3. **Toggle switch** — niespójny CSS naprawiony (B12)
4. **Preview** — pełny mock UI zamiast placeholdera (B13)

### Zostało do zrobienia:

1. **Sync progress bar** — floating window nie ma progress bar, dodać
2. **Zamknięcie floating window → powrót do AudioView** — obecnie tylko chowa okno, nie nawiguje
3. **Sync głośności** — slider głośności w floating window
4. **Sync shuffle/repeat** — stany shuffle/repeat w floating window
5. **Sync ulubionych** — Heart button w floating window

---

## FAZA 4 — Pełnyscreen Audio Layouts 
### Zadania:
1. Layout "cover" — duży artwork + info + controls (rozbudowany)
2. Layout "visualizer" — pełnoekranowa wizualizacja canvas z animacjami
3. Layout "combined" — artwork + wizualizacja w tle z efektami
4. Przełączanie layoutów klawiszem L lub guzikiem
5. Automatyczne ukrywanie kontroli po 3s (jak w wideo player)
6. Animacje przejść między layoutami

---

## FAZA 5 — Ulubione + Ulepszona Biblioteka 

### Zadania:
1. Widok "Ulubione" w bibliotece (filter po `isFavorite`)
2. Sortowanie wg częstotliwości odtwarzania (playCount)
3. Szybkie dodawanie/usuwanie z ulubionych w każdym widoku (kontekst menu)
4. Statystyki odtwarzania (czas, ilość, top artyści)
5. Auto-tagowanie na podstawie metadata

---

## FAZA 6 — Playlista (electron-store) 

### Zadania:
1. Tworzenie/edycja/usuwanie playlist
2. Zapis w `electron-store` (persistent)
3. Drag & drop kolejności w playlist
4. Eksport/import M3U/M3U8
5. Playlisty systemowe (auto-generated: "Ostatnio odtwarzane", "Najczęściej odtwarzane")

---

## FAZA 7 — Zarządzanie folderami + Ustawienia 

### Zadania:
1. Skanowanie folderów muzycznych (background)
2. Auto-dodawanie nowych plików do biblioteki
3. Zaawansowane ustawienia EQ (zapis custom presetów)
4. Shortcuts customizacja (UI do mapowania klawiszy)
5. Eksport/import ustawień

---

