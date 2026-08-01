# Analiza aplikacji Onda — błędy, martwy kod, optymalizacje

Data: 2026-08-01
Metoda: 3 równoległe agenty (błędy runtime / martwy kod / optymalizacje + weryfikacja raport.md) + weryfikacja kluczowych grepów.
Status: 🔴 #1-2 i 🟠 #3-6 NAPRAWIONE i zweryfikowane (typecheck 0, 153/153 testy, build OK). + 🔴 #7 (PiP wideo DataCloneError) NAPRAWIONE.

---

## 🔴 Błędy runtime

### Krytyczne

1. ✅ **`app:quit` bez handlera** — `AppMenu.vue:77` woła `invoke('app:quit')`, ale w `src/main` nie ma `ipcMain.handle('app:quit')` (0 trafień w grep). Dodatkowo `index.ts:59-64` przechwytuje `close` i chowa okno do tray → `window-all-closed` nigdy nie odpala. **Aplikacji nie da się zamknąć z UI** — jedynie tray „Quit" (`index.ts:143-147`).
   - ✅ Poprawka: `ipcMain.handle('app:quit', () => { tray?.destroy(); app.quit(); })` — **dodany w `index.ts:241-246`**.

2. ✅ **Media server bez autoryzacji** — `media-server.ts:39-99`: serwer `http://127.0.0.1:<losowy port>/?path=C:\...` serwuje każdy plik po absolutnej ścieżce; nagłówek `access-control-allow-origin: *` (l.63), brak tokena. Każda strona WWW w przeglądarce użytkownika (lub lokalny proces) może przeskanować port i odczytać dowolny plik z dysku.
   - ✅ Poprawka: losowy sekret `crypto.randomUUID()` w URL (`...:PORT/<token>/`), weryfikacja `timingSafeEqualString`, usunięty `access-control-allow-origin: *`, `416` dla nieprawidłowego Range — **wdrożone w `media-server.ts` + `index.ts:235`**.

### Średnie

7. ✅ **PiP wideo — `DataCloneError: An object could not be cloned`** — kliknięcie PiP rzucało błąd w `usePiP.ts:63` (`pipStart`). `getLastSubtitleData()` (i `preparePiPSubtitleData`) budowały `plain` z `lastSubtitleData.fonts`, czyli **Vue reactive proxy** (bo `track.fonts` pochodzi ze stanu Pinia). `structuredClone(plain)` rzucał `DataCloneError` (proxies nie są klonowalne), a catch zwracał `plain` **nadal z proxy** → przekazanie do funkcji preload rzuca `An object could not be cloned` na granicy `contextBridge`, zanim `tryInvoke` je złapie.
   - ✅ Poprawka: w `useSubtitleRenderer.ts` ręczna kopia do czystych (nie-reaktywnych) obiektów — `fonts.map(f => ({ name, ext, data: Array.from(f.data) }))`, `availableFonts` tylko stringi + odfiltrowane `blob:` URL (bezużyteczne poza procesem); niepotrzebny `structuredClone` usunięty. Zdiagnozowane stack trace z `[ErrorBoundary]`.

### Średnie

3. ✅ **Tray + globalne skróty mediów wysyłają `media:*`, ale nikt nie nasłuchuje** — `index.ts:130-167` → `webContents.send('media:playPause'|'media:next'|...)`. W rendererze zero `api.on('media:...')` (grep: 0 trafień). Tray Play/Pause/Next/Previous i klawisze multimediów to ciche no-opy.
   - ✅ Poprawka: w `App.vue` onMounted zarejestrować `api.on('media:playPause', () => player.togglePlay())` itd. — **wdrożone (App.vue:117)**.

4. ✅ **`fs:readdir` bez try/catch** — `fs-handlers.ts:233-258`: `readdir(resolvedPath)` (l.239) bez catch; na błędzie handler rejectuje bez `done:true`. `explorer.ts:150-185` — spinner zależy od `done:true`; try/catch w renderer (l.175-184) jest martwy, bo preload `tryInvoke` nigdy nie rejectuje. Wejście w niedostępny folder → `isLoading=true` na stałe.
   - ✅ Poprawka: w main owinąć `readdir` i w catch wysłać `fs:readdir:batch { done: true, items: [], error }` — **wdrożone (fs-handlers.ts:239-247) + toast „Błąd odczytu folderu" w `explorer.ts`**.

5. ✅ **`useThumbnail` — `?.invoke(...).then(...)`** — `useThumbnail.ts:54-98`: gdyby `window.api` był undefined, `undefined.then` rzuciłoby TypeError synchronicznie wewnątrz `task()`. `thumbLoader.ts:48-54` — synchroniczny wyjątek nie woła `thumbTaskDone()` → `thumbActive` zawyżone → **kolejka miniatur zastyga**.
   - ✅ Poprawka: `const r = window.api?.invoke(...); if (!r) { thumbTaskDone(); return; }` — **wdrożone w `useThumbnail.ts` (thumb + oba fallbacki ikon)**.

6. ✅ **Błędna ewiksja LRU** — `thumbLoader.ts:21-30`: wspólna `iconAccessOrder` dla `thumbCache` i `iconCache`; `lruSet` usuwa ewiktowany klucz tylko z jednej mapy. Limit 500 nie jest per-cache przestrzegany → wyciek pamięci.
   - ✅ Poprawka: osobna kolejność per mapa (`thumbAccessOrder`/`iconAccessOrder`) — **wdrożone w `thumbLoader.ts`**.

### Kosmetyczne

- `media:renameFile` (`media-handlers.ts:191`) — brak guardu na pustą nazwę → `join(dir, ext)` tworzy ukryty plik.
- `uniqueDestPath` (`fs-handlers.ts:153-154`) — brak `\` w ścieżce → `substring(0,-1)` → `''`; kruche.
- `subtitles:findExternal` (`subtitle-handlers.ts:109-114`) — ścieżka bez separatora → `readdir('')` → błąd → `[]`.
- `media-server.ts:66-86` — malformed Range → 500 zamiast 416; brak obsługi sufixu `-`.
- `ImageViewer.vue:164` — `setTimeout(revokeObjectURL, 30000)` bez anulowania → obraz psuje się po 30 s.
- `TrackTagEditor.vue:145` — `setTimeout(emit('close'), 600)` bez cleanup.
- `AppMenu.vue:71` — optymistyczne `isMaximized` może rozjechać się ze stanem.
- `useSubtitleRenderer.ts:99,117` — blob URL-e fontów nie revokowane → wyciek pamięci.
- `useVideoPlayer.ts:36`, `audioEngine.ts:10` — `window.api.mediaServerUrl` bez `?.`.
- `index.ts:17` — `preFullscreenBounds` jako `const ... = null`; `window-ipc.ts` dostaje `{ current: preFullscreenBounds }`; przy fullscreen `setBounds` nie zadziała. Poprawka: mutable.

---

## 🟡 Martwy kod

### (A) Nieużywane pliki

- `src/renderer/src/modules/audio-eq.ts`
- `src/renderer/src/modules/audio-secondary.ts`
- `src/renderer/src/modules/audio-utils.ts`
- `src/renderer/src/utils/ipc.ts`
- `src/renderer/src/components/explorer/ExplorerPromptDialog.vue`

### (B) Nieużywane eksporty / funkcje / typy

- `utils/constants.ts`: `APP_NAME`, `APP_VERSION`, `SUPPORTED_AUDIO_FORMATS`, `SUPPORTED_VIDEO_FORMATS`, `SUPPORTED_PLAYLIST_FORMATS`, `SUPPORTED_SUBTITLE_FORMATS`, `ALL_MEDIA_FORMATS`, `DEFAULT_EQUALIZER_BANDS`, `EQUALIZER_PRESETS` (tylko `SUPPORTED_IMAGE_FORMATS`, `DEFAULT_*`, `THEME_PALETTES` używane).
- `utils/formatters.ts`: `formatRelativeTime`, `generateId`, `getFileExtension`, `getFileNameWithoutExtension`, `truncate` — tylko w testach.
- `utils/fileTypes.ts`: `getMediaFileType` — tylko testy.
- Typy: `NavigationState`, `VIEW_MODE_LABELS` (types/explorer.ts); `PlayerState`, `MediaMetadata`, `MediaPicture` (types/media.ts); `YouTubeChannel`, `YouTubePlaylist` (types/youtube.ts).
- `stores/player.ts` — `loadFavorites` nigdy niewołane.
- `preload/index.ts` — `cleanupTranscodedAudio` → kanał `media:cleanupTranscodedAudio` nieużywany.

### (C) Nieużywane kanały IPC (zarejestrowane, niewołane)

- `fs:stat`, `fs:readFile`, `fs:writeFile`, `fs:rename`
- `shell:openExternal`
- `window:isMaximized`
- `dialog:saveFile`
- `explorer:list`
- `window:createChild`, `window:closeChild`, `pip:updatesrc`
- `app:getVersion`
- `media:getMetadata`, `media:cleanupTranscodedAudio`
- `musicbrainz:getCoverUrl`
- `yt:getInfo`, `yt:download`, `yt:getChannel` (używany tylko `yt:search`)
- `update:check`, `update:download`, `update:install`

---

## 🟢 Duplikacje

- `formatDur` ×3: `LibraryTrackCard.vue:98`, `LibraryVideoRow.vue:29`, `VideoCard.vue:29` → `formatters.formatDuration`.
- `toFileUrl`: `audioEngine.ts:8`, `ImageViewer.vue:154` (+ martwy w `audio-utils.ts`).
- Presety EQ: `Equalizer.vue:9-18` == `useAudioPiP.ts:246-255` + martwy `EQUALIZER_PRESETS`.
- Logger: `main/utils/logger.ts` == `renderer/utils/logger.ts` (bajt w bajt) → przenieść do `shared/`.
- Listy rozszerzeń: `SUPPORTED_*` (renderer, martwe) vs `shared/constants.ts` vs inline `main/utils/sharp.ts:21`, `ExplorerView.vue:144-147`.

---

## 📋 Status punktów z `raport.md`

| # | Punkt | Status |
|---|---|---|
| 1 | ModuleManager lifecycle | NADAL (PlayerModule jedyny z init(); puste deactivate/destroy w Settings/Home) |
| 2 | Typowanie IPC/preload | NADAL (`string`/`unknown`/`any`; `utils/ipc.ts` to tylko rzutowania) |
| 3 | YouTube | NADAL (wszystkie kanały „not yet implemented") |
| 4 | dependency-handlers | NADAL (`installYtdlp` Windows-only; choco/brew/apt) |
| 5 | audioEngine | CZĘŚCIOWO (`connectVideoElement` poprawiony; `disconnectVideoElement` pusty; reuse źródła zostaje) |
| 6 | `any` | NADAL (MusicBrainzLookup, useSubtitleRenderer, preload d.ts) |
| 7 | ffprobe/bezpieczeństwo | NADAL (ścieżka w cudzysłowach w komendzie shellowej) |
| 8 | Testy | NADAL (5 plików testowych, brak audioEngine/VideoPlayer/IPC/deps) |
| 9 | coverCache / hash | CZĘŚCIOWO (coverCache = ref NAPRAWIONO; FNV-1a + invalidateDerivedCache) |

---

## ⚡ Optymalizacje

- `recentTracks`/`mostPlayed` (`library.ts:53-63`) — pełne sortowanie przy każdym `recordPlay` → top-N przez częściową selekcję.
- `folderFileCount` (`LibraryView.vue:147-149`) — O(foldery × utwory) per render, bez memoizacji.
- Zakładki Images/Artists/Folders (`LibraryView.vue:766-944`) — brak wirtualizacji (reszta tak).
- Podwójne odświeżanie czasu — `timeupdate` + rAF 60fps (`audioEngine.ts:114-160`) re-renderują pasek postępu cały czas → wystarczy `timeupdate` + rAF tylko przy widoczności paska.
- `lightningcss-win32-x64-msvc` w `dependencies` (package.json:39) → devDependencies; `@vue/test-utils` nieużywany.
- `triggerRef(coverCache)` ×3 w jednym przepływie (`player.ts:249,253,258`) → raz.
- `lfa-ponyfill` statycznie w `useSubtitleRenderer.ts:23` — niepotrzebnie wciągany do głównego chunk'a.
- `watch(filteredTracks)` w `LibraryView.vue:372-378` wyzwala preload coverów przy każdej zmianie filtra.

---

## Uwagi

- `scanProgress.current` NIE jest martwy (czytany w `SettingsLibraryFolders.vue:105`), ale nigdy nie rośnie podczas skanu — oszukujący.
- Zweryfikowane jako OK: wszystkie `window:*`, `shell:*`, `fs:*`, `dialog:*`, `explorer:*`, `pip:*`, `audio-pip:*`, `media:getDuration`/`getMetadata`, `subtitles:*`, `playlist:*`, `library:*`, `dep:*`, `musicbrainz:*` — handlery istnieją.
- `window:idSync`/`media:getServerUrlSync` — żywe (preload sendSync, `window.api.mediaServerUrl`).

---

## ✅ Do zrobienia (checklista postępu)

### NAPRAWIONE (✓)
- [x] #1 `app:quit` — handler w main
- [x] #2 media-server — token + usunięty CORS `*`
- [x] #3 nasłuch `media:*` w renderer (tray/skróty)
- [x] #4 `fs:readdir` try/catch + toast błędu
- [x] #5 `useThumbnail` guard na `window.api?.invoke`
- [x] #6 LRU per-cache w `thumbLoader.ts`
- [x] (wcześniej) błędy runtime #1-6 z poprzedniego raportu: `media:getDuration`, hashTracks FNV-1a, `isUnderPath`, `crypto.randomUUID` playlisty, preload catch, console.logi PiP
- [x] **Kosmetyczne błędy** (10 pozycji, sekcja 🔴) — `preFullscreenBounds` mutable, guard pustej nazwy `media:renameFile`, `dirname` w `uniqueDestPath`/`findExternal`, suffix Range `bytes=-N`, ImageViewer revoke ObjectURL, TrackTagEditor timer cleanup, AppMenu bez optymistycznego toggle, destroySubtitleRenderer revoke fontów, `mediaServerUrl` optional
- [x] **Martwy kod 🟡 (A+B+C)** — usunięte pliki (audio-eq/audio-secondary/audio-utils/ipc.ts/ExplorerPromptDialog), martwe eksporty/typy (formatters, fileTypes, constants, PlayerState, NavigationState, VIEW_MODE_LABELS, YouTubeChannel/Playlist, loadFavorites), kanały IPC: `fs:stat/readFile/writeFile/rename`, `shell:openExternal`, `window:isMaximized`, `dialog:saveFile`, `explorer:list`, `app:getVersion`, `media:getMetadata`, `media:cleanupTranscodedAudio`, `musicbrainz:getCoverUrl`, `yt:getInfo/download/getChannel`, `update:check/download/install`, `window:createChild/closeChild`, `pip:updatesrc` (+ martwa metoda `PipManager.play`) + sprzątnięcie nieużywanych importów w main; `shared/types/ipc.ts` i `preload/index.d.ts` zaktualizowane
- [x] **Duplikacje 🟢** — wspólny `formatDuration` (3× `formatDur` usunięte; dodany placeholder), `toMediaServerUrl` w `utils/mediaUrl.ts` (6 miejsc: audioEngine, useVideoPlayer, pip-audio, player-cover, ImageViewer, MediaCover, LibraryView), presety EQ → `EQUALIZER_PRESETS` w `utils/constants.ts` (Equalizer.vue + useAudioPiP), logger → `shared/logger.ts` (usunięte 2 duplikaty), listy rozszerzeń ujednolicone (`SUPPORTED_IMAGE_FORMATS` usunięte, ExplorerView używa `@shared/constants`, `.flv` dodane do shared `VIDEO_EXTS`)
- [x] **#7 PiP wideo `DataCloneError`** — reactive proxy (Pinia) w danych napisów przechodzące do `contextBridge`; fix w `getLastSubtitleData`/`preparePiPSubtitleData` (czyste kopie, filtrowanie `blob:`, usunięty `structuredClone`)

### POZOSTAŁE (do wyboru)
- [ ] **Optymalizacje ⚡** — WYKONANE z wyjątkiem wirtualizacji Images/Artists/Folders (pominięta — duży refaktor UI, ryzyko bez testów wizualnych): top-N sort `recentTracks`/`mostPlayed` (częściowa selekcja zamiast pełnego sortu, `library.ts`), memoizacja liczników folderów (`folderFileCounts` computed w `LibraryView.vue`), usunięta podwójna emisja `timeUpdate` (`audioEngine.ts`), `triggerRef(coverCache)` ×3→×2 (`player.ts`), `lfa-ponyfill` dynamiczny import (`useSubtitleRenderer.ts`), `lightningcss-win32-x64-msvc`→devDependencies, usunięty nieużywany `@vue/test-utils`
- [ ] **Wirtualizacja zakładek Images/Artists/Folders w `LibraryView.vue`** — do rozważenia z testami wizualnymi
- [ ] **Punkty z `raport.md`** — typowanie IPC/preload (silne typy kanałów), YouTube (implementacja lub ukrycie UI), dependency-handlers (installYtdlp wieloplatformowy), `disconnectVideoElement`, zamiata `any`, ffprobe bezpieczne wykonywanie, więcej testów (audioEngine/VideoPlayer/IPC)

