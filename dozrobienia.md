# Do zrobienia — Onda

> Stan na: 2026-07-28 (kompleksowy przegląd + fixy)
> typecheck: 0 błędów, testy: 141/141

---

## 🔴 ~~Krytyczne~~ ✅ Naprawione

### 1. `npmRebuild: false` → `true`
**Plik:** `electron-builder.yml:40`
**Fix:** zmieniono na `npmRebuild: true`.

### 2. Shell injection — `execAsync` → `execFile`
**Pliki:** `media-handlers.ts`, `subtitle-handlers.ts`, `cover-cache.ts`, `library-handlers.ts`
**Fix:** wszystkie wywołania ffprobe/ffmpeg/mkvextract zamienione na `execFile` (brak shella). Łącznie 10 calli w 4 plikach.

### 3. Path traversal w fs:* handlerach
**Plik:** `src/main/ipc/fs-handlers.ts`
**Fix:** dodano `isPathSafe()` — blokuje `..` i znaki kontrolne. Aplikowane we wszystkich 7 handlerach (`fs:readdir`, `stat`, `readFile`, `writeFile`, `mkdir`, `rename`, `delete`).

### 4. Path traversal w media-server
**Plik:** `src/main/media-server.ts:50-51`
**Fix:** dodano `normalized.includes('..')` check — zwraca 403.

### 5. `fs:readdir` bez try-catch
**Plik:** `src/main/ipc/fs-handlers.ts:93-118`
**Fix:** całe ciało handlera owinięte w try-catch, wysyła batch `{done: true, items: []}` przy błędzie.

---

## 🟠 ~~Wysoki priorytet~~ ✅ Naprawione

### 6. Brak debounce na wyszukiwanie w LibraryView
**Plik:** `src/renderer/src/views/LibraryView.vue:33,48-75`
**Fix:** dodano `debouncedQuery` z watch + `setTimeout(200)`, `onUnmounted` cleanup. Wszystkie 4 computed (`filteredTracks`, `filteredVideo`, `filteredArtists`, `filteredAlbums`) używają `debouncedQuery`.

### 7. Zasięg testów — krytycznie niski
**Opis:** Dalej do zrobienia — tylko 4 pliki testowe. Bez zmian.

### 8. Listenery `ipcMain.on` w pip-manager nigdy nie wyrejestrowane
**Plik:** `src/main/pip-manager.ts:111-126`
**Fix:** dodano `ipcMain.removeAllListeners('pip:hidden'/'pip:timeUpdate'/'pip:ended')` w `destroy()`.

### 9. Busy-wait spinlock w `extractAndCacheCover`
**Plik:** `src/main/ipc/cover-cache.ts:191-193`
**Fix:** zastąpiono `while + setTimeout` pollingiem przez `setInterval` z timeoutem 5s.

### 10. Race condition w `savePersistentCover`
**Plik:** `src/main/ipc/cover-cache.ts:106-108`
**Fix:** dodano mutex (`saveMapLock: Promise<void>`) synchronizujący dostęp do `store.set`, użyto `structuredClone`.

### 11. Bezpośrednia mutacja store track objects (editingTrack)
**Plik:** `src/renderer/src/views/LibraryView.vue:78,272-298` + `src/renderer/src/stores/library.ts`
**Fix:** dodano `library.updateTrack(path, updater)` z `triggerRef(tracks)`, użyto w `onTagSaved` zamiast bezpośrednich mutacji.

### 12. `JSON.parse(JSON.stringify(...))` deep clone
**Plik:** 6 plików (cover-cache, media-handlers, library-handlers, library, LibraryView, useSubtitleRenderer)
**Fix:** wszystkie zamienione na `structuredClone(...)` (poza `savePlaylists` — jsdom nie wspiera `structuredClone`).

### 13. `artists` i `albums` computed — iteracja całej tablicy
**Opis:** Dalej do optymalizacji — `computed` z `Map` działa, ale przelicza się przy każdej zmianie `tracks`.

### 14. `loadFromDisk` nie czeka na `scheduleLoadTracks`
**Plik:** `src/renderer/src/stores/library.ts:59-76`
**Fix:** dodano `scheduleLoadTracksAsync()` zwracające Promise; `loadFromDisk` używa `await scheduleLoadTracksAsync()`.

### 15. Race condition w explorer `loadFiles`
**Plik:** `src/renderer/src/stores/explorer.ts:97-122`
**Fix:** dodano `currentLoadId` — batch callback i catch sprawdzają `loadId === currentLoadId` przed aktualizacją stanu.

---

## 🟡 ~~Średni priorytet~~ ✅ Większość naprawiona

### Wydajność

| # | Opis | Plik | Status |
|---|------|------|--------|
| 16 | Synchronous FS w async handlerach (`existsSync`, `mkdirSync`, `readFileSync`, `writeFileSync`) | `media-handlers.ts`, `utils/sharp.ts` | ✅ `fs/promises` (access, mkdir, readFile, writeFile) |
| 17 | `batchThumbnails` race condition na zapisie cache | `media-handlers.ts:69-112` | ✅ per-plik lock (`batchThumbnailLocks`) |
| 18 | `processCoverBatch` — `setTimeout(r, 0)` co 5 itemów | `player.ts:191` | ✅ zamieniono na `queueMicrotask` (0ms narzut) |
| 19 | `enrichTrack` mutuje `track.duration` bezpośrednio | `player.ts:242-244` | ✅ użyto `useLibraryStore().updateTrack()` |
| 20 | `nextTrack` z repeat 'one' zwraca ten sam obiekt | `player.ts:256-281` | ✅ zwraca shallow copy `{ ...currentTrack.value }` |

### Błędy

| # | Opis | Plik | Status |
|---|------|------|--------|
| 21 | `shell:openExternal` — `new URL()` przepuszcza `javascript:` | `fs-handlers.ts:200-213` | ✅ już było naprawione (tylko http:/https:/mailto:) |
| 22 | `subtitles:extractEmbedded` — hardkodowane `.ass` + ffprobe `s:N` vs global index | `subtitle-handlers.ts:52` | ✅ codec detection → ext map; naprawiono `s:${streamIndex}` → `${streamIndex}` (globalny indeks) |
| 23 | `subtitles:findExternal` — `startsWith` fałszywe trafienia | `subtitle-handlers.ts:77-79` | ✅ `baseName === videoName \|\| baseName.startsWith(videoName + '.')` |
| 24 | `connectSecondaryAudio` rozłącza `sourceNode` | `audioEngine.ts:272-283` | ✅ reconnect `sourceNode` → `crossfadeGainA` |
| 25 | `togglePiP` nie sprawdza `videoRef.value` | `useVideoPlayer.ts:221-229` | ✅ `videoRef.value?.pause()` |
| 26 | `subtitles:extractAttachments` — temp cleanup + ffmpeg fallback | `subtitle-handlers.ts:107-170` | ✅ `rm` w `finally` block; uproszczona logika (1× ffmpeg dump_all zamiast per-stream); `-dump_attachment "" -f null -` |
| 27 | `cleanups` w `useAudioPlayer` nigdy nie iterowany | `useAudioPlayer.ts:16` | ✅ `onUnmounted(() => cleanups.forEach(fn => fn()))` |
| 28 | Detached `effectScope` bez `scope.stop()` | `useAudioPlayer.ts:55` | ✅ `scope?.stop()` w `onUnmounted` |
| 29 | Brak `engines` w package.json | `package.json` | ✅ dodano `"engines": { "node": ">=18" }` |
| 30 | `npmRebuild: false` duplikat | — | ✅ już naprawione |
| 31 | Embedded fonty nie trafiały do `availableFonts` jassub | `useSubtitleRenderer.ts:105-144` | ✅ dodano blob URL z font data do fontMap zamiast polegać tylko na `fonts: mkvFonts` |
| 32 | Brak logów w pipeline napisów — ciężko debugować | `useSubtitleRenderer.ts, player.ts` | ✅ dodano logi: font count + rozmiar, format, missing font names, codec detection |

### Typowanie

| # | Opis | Plik | Status |
|---|------|------|--------|
| 31 | `as any` na `mbFetch` — cała funkcja bez typów | `musicbrainz.ts:9-37` | ✅ dodano `Record<string, unknown> \| string` |
| 32 | `as any` w catch — `(e as any).message?.startsWith` | `musicbrainz.ts:66` | ✅ użyto `errMsg(e)` zamiast `as any` |
| 33 | `as any` na `library:loadScanned` — `data as any` | `library-handlers.ts:367` | ✅ runtime type guard + proper type |
| 34 | `as Playlist[]` bez walidacji runtime | `library-handlers.ts:393` | ✅ `isValidPlaylistArray()` guard |
| 35 | `this.window!` — non-null assertion, może być null | `pip-manager.ts:166` | ✅ rzuca `Error` zamiast `!` |

### Cross-platform

| # | Opis | Plik | Status |
|---|------|------|--------|
| 36 | `getMkvExtractPath` hardkodowane `C:\Program Files\...` — tylko Windows | `dependency-handlers.ts:56-74` | ✅ dodano macOS/Linux ścieżki (`/usr/local/bin`, `/opt/homebrew/bin`, itd.) |
| 37 | `dep:installFfmpeg` zakłada Chocolatey — tylko Windows | `dependency-handlers.ts:110-128` | ✅ `brew install` / `apt-get install` dla macOS/Linux |
| 38 | `dep:installMkvextract` zakłada Chocolatey — tylko Windows | `dependency-handlers.ts:162-181` | ✅ `brew install` / `apt-get install` dla macOS/Linux |
| 39 | `getMkvExtractPath` tylko 2 ścieżki — brak custom instalacji | `dependency-handlers.ts:56-74` | ✅ dodano 5 ścieżek + `mkvextract` z PATH |

### Leaki zasobów

| # | Opis | Plik | Status |
|---|------|------|--------|
| 40 | pip-preview: brak listenera `closed` — BrowserWindow nie nullowany po zamknięciu | `pip-preview.ts:55-56` | ✅ dodano `window.on('closed', () => window = null)` |
| 41 | `savePersistentCover` — temp plik pozostaje orphanem jeśli crash po `writeFile` | `cover-cache.ts:100-101` | ✅ startup cleanup — usuwa pliki nieobecne w cacheMap |
| 42 | Temp transcoding never cleaned up — `os.tmpdir()/onda/audio-transcodes/` rośnie | `media-handlers.ts:248-296` | ✅ startup cleanup — usuwa pliki starsze niż 24h |

---

## 🔵 Niski priorytet

### ❌ Zweryfikowane — do skasowania z listy

| # | Opis | Werdykt |
|---|------|---------|
| 43 | `normalizeFilePath` w PipManager — nigdy nie używana | ❌ **Jest używana** (linie 246-247) |
| 44 | `extname` w sharp.ts — nieużywany import | ❌ **Jest używane** (linie 35, 56) |
| 45 | `crossfadeGainB` — zawsze gain = 0, nigdy nie używany | ❌ **Jest używany** w crossfade (ramp 0→1) |
| 46 | `crossfadeGainA` / `crossfadeGainB` — mylące nazwy | ❌ **Nazwy celowe** — A=primary, B=secondary source |
| 47 | Duplikacja `globalShortcut.unregisterAll()` | ❌ **Celowa** — różne eventy (window-all-closed vs will-quit) |
| 48 | `v-for` key `'vr-' + row.top` — duplikaty | ❌ **Unikalne** — row.top z virtualizera |
| 49 | `v-for` key `'ar-' + row.top` — duplikaty | ❌ **Unikalne** — row.top z virtualizera |
| 50 | `v-for` key `:key="name"` dla albumów | ❌ **Unikalne** — albumy deduplikowane przez Map |

### ✅ Zrobione

| # | Opis | Fix |
|---|------|-----|
| 51 | Brak `.nvmrc` | ✅ utworzono `.nvmrc` (Node 22) |
| 53 | Brak `packageManager` w package.json | ✅ dodano `"packageManager": "npm@11.13.0"` |

### ⏳ Zostało do ogarnięcia

| # | Opis | Status |
|---|------|--------|
| 52 | CI/CD (GitHub Actions) | ✅ zrobione |
| 54 | publish URL | ✅ zmieniono na github provider |
| 55 | notarize | ✅ dodana instrukcja z env vars |
| 56 | Notification auto-removal | ✅ try-catch |
| 57 | settings save setTimeout | ✅ usunięty debounce |
| 58 | youtube.ts | ❌ całość to stub — wymaga yt-dlp implementacji |
| 59 | sharp | ❌ już najnowszy (0.35.3) |
| 60 | @lucide/vue | ❌ już najnowszy (1.27), v2 nie istnieje |

### Nowe itemy z audytu kodu — do decyzji

| # | Opis | Plik | Severity |
|---|------|------|----------|
| 61 | `audioEngine.ts` — crossfade cleanup przy unmount | `audioEngine.ts:183-265` | medium |
| 62 | `reorderQueue` — miesza computed z surowymi tablicami | `player.ts:160-177` | medium |
| 63 | `library.ts` — `artists`/`albums` computed O(n) na każdą zmianę | `library.ts:35-57` | low |
| 64 | `player.ts` — `loadFavorites()` wołane przed `window.api` ready | `player.ts:83` | low |
| 65 | `usePiP.ts` — listenery mogą być duplikowane | `usePiP.ts:17-31` | low |

### ✅ Zrobione

| # | Opis | Fix |
|---|------|-----|

---

## ✅ Wszystkie naprawione (dla kontekstu)

| Fix | Data |
|-----|------|
| Podział `main/index.ts` (503→180 linii) — protocol.ts, window-ipc.ts | — |
| Podział `pip-manager.ts` (427→277 linii) — pip-preview.ts | — |
| Podział `audioEngine.ts` (643→503 linii) — audio-eq.ts, audio-utils.ts, audio-secondary.ts | — |
| Podział `player.ts` (491→407 linii) — player-cover.ts | — |
| IPC try-catch: 17 handlerów (playback, dialog, fs, window) | — |
| `shell.openExternal` URL validation (tylko https:, http:, mailto:) | — |
| Usunięte zależności: jsmediatags, electron-updater | — |
| Fix: `handleEnded` woła `nextTrack()` bezpośrednio (zamiast event bus) | — |
| Fix: `media:getDuration` handler | — |
| Fix: video→audio widok w PlayerView | — |
| Fix: preload okładek dla albumów | — |
| Fix: `player.finish()` — czyści stan gdy kolejka pusta | — |
| Fix: usunięty automatyczny crossfade z `handleEnded` | — |
| Fix: duplikacja pierwszego tracka w `playTracks`/`playAll`/`playPlaylist` | — |
| Fix: double loadTrack/play (useAudioPlayer + PlayerView) | — |
| Fix: coverProcessing blokada (try/finally) | — |
| Fix: command injection `shell:openTerminal` (execFile zamiast exec) | — |
| Fix: `.catch()` na `app.whenReady()` | — |
| Fix: `fullscreenchange` cleanup w PlayerView | — |
| Fix: Album ResizeObserver disconnect | — |
| Fix: `disconnectVideoElement` no-op | — |
| Fix: `init()` nie resetuje ustawień użytkownika (videoFilter, playbackSpeed) | — |
| Fix: scalone 2 watchery na `currentTrack` w useVideoPlayer (duplikacja napisów) | — |
| Fix: try-catch na pip:* handlers (8×) | — |
| Fix: try-catch na cover-handlers, fs:readdir, app:getPath | — |
| Fix: `reorderQueue()` — pendingLen cache przed drugim odczytem | — |
| Fix: `withoutEnlargement` w media-handlers | — |
| Fix: `dirname()` zamiast `lastIndexOf` w subtitle-handlers | — |
| Usunięty martwy kod: setupVideoListeners, crossfadeDuration, library.search(), SharpService (4 metody), PipManager.getTime/isShowing, normalizeFilePath | — |
| Usunięte `ignoreDeprecations: "5.0"` z obu tsconfig | — |
| Fix: `npmRebuild: false` → `true` w electron-builder | 2026-07-27 |
| Fix: shell injection — `execAsync` → `execFile` (10 calli, 4 pliki) | 2026-07-27 |
| Fix: path traversal we wszystkich fs:* handlerach (`isPathSafe`) | 2026-07-27 |
| Fix: path traversal w media-server (`..` check → 403) | 2026-07-27 |
| Fix: `fs:readdir` top-level try-catch | 2026-07-27 |
| **Fix: debounce w LibraryView (debouncedQuery + 200ms timer)** | **2026-07-27** |
| **Fix: pip-manager listener cleanup (removeAllListeners w destroy)** | **2026-07-27** |
| **Fix: cover-cache busy-wait (setInterval polling + 5s timeout)** | **2026-07-27** |
| **Fix: savePersistentCover race (saveMapLock mutex)** | **2026-07-27** |
| **Fix: editingTrack mutation (updateTrack + triggerRef)** | **2026-07-27** |
| **Fix: JSON.parse(JSON.stringify) → structuredClone (6 plików)** | **2026-07-27** |
| **Fix: loadFromDisk await scheduleLoadTracksAsync** | **2026-07-27** |
| **Fix: explorer loadFiles race (currentLoadId)** | **2026-07-27** |
| **Fix: sync FS → async w media-handlers + sharp.ts (existsSync/mkdirSync/readFileSync/writeFileSync)** | **2026-07-27** |
| **Fix: batchThumbnails race (per-file lock batchThumbnailLocks)** | **2026-07-27** |
| **Fix: enrichTrack mutacja (useLibraryStore().updateTrack)** | **2026-07-27** |
| **Fix: nextTrack repeat 'one' zwraca shallow copy** | **2026-07-27** |
| **Fix: subtitles:extractEmbedded — ffprobe codec detection zamiast .ass** | **2026-07-27** |
| **Fix: subtitles:findExternal — word-boundary match zamiast startsWith** | **2026-07-27** |
| **Fix: connectSecondaryAudio — reconnect sourceNode do crossfadeGainA** | **2026-07-27** |
| **Fix: togglePiP — optional chaining (videoRef.value?.pause())** | **2026-07-27** |
| **Fix: subtitle temp cleanup w finally block** | **2026-07-27** |
| **Fix: useAudioPlayer cleanups iteracja + scope.stop() w onUnmounted** | **2026-07-27** |
| **Fix: processCoverBatch — queueMicrotask zamiast setTimeout(r,0)** | **2026-07-27** |
| **Fix: engines w package.json (node >=18)** | **2026-07-27** |
| **Fix: musicbrainz.ts — typowanie mbFetch (Record<string, unknown>) + errMsg w catch** | **2026-07-27** |
| **Fix: library-handlers.ts — runtime type guard zamiast as any / as Playlist[]** | **2026-07-27** |
| **Fix: pip-manager.ts — throw zamiast non-null assertion (this.window!)** | **2026-07-27** |
| **Fix: dependency-handlers — cross-platform ścieżki mkvextract + brew/apt install** | **2026-07-27** |
| **Fix: pip-preview.ts — listener closed nulluje BrowserWindow** | **2026-07-27** |
| **Fix: cover-cache startup — cleanup orphaned cover files** | **2026-07-27** |
| **Fix: media-handlers startup — cleanup old audio-transcodes (>24h)** | **2026-07-27** |
| **Fix: ffprobe stream specifier `s:N` → global index (codec detection)** | **2026-07-27** |
| **Fix: embedded fonty — blob URL-e w fontMap zamiast tylko `fonts: mkvFonts`** | **2026-07-27** |
| **Fix: ffmpeg fallback dump_attachment — `-dump_attachment:T` → `"" -f null -`** | **2026-07-27** |
| **Fix: logi w pipeline napisów (codec, font count, font names, missing)** | **2026-07-27** |
| **Fix: dodano .nvmrc (Node 22)** | **2026-07-27** |
| **Fix: dodano packageManager w package.json** | **2026-07-27** |
| **Zweryfikowano: items 43-50 to false alarms / celowe zachowanie** | **2026-07-27** |
| **Fix: settings save() bez setTimeout — natychmiastowy zapis** | **2026-07-27** |
| **Fix: notification try-catch w setTimeout** | **2026-07-27** |
| **Fix: CI/CD — GitHub Actions (lint + typecheck + test + build)** | **2026-07-27** |
| **Fix: publish generic → github provider** | **2026-07-27** |
| **Fix: notarize — dodano komentarz + env var instrukcja** | **2026-07-27** |
| **Zweryfikowano: youtube-handlers to stub, nie do walidacji** | **2026-07-27** |
| **Zweryfikowano: sharp 0.35.3 i @lucide/vue 1.27 już najnowsze** | **2026-07-27** |
| **Fix: shell:openTerminal — spawn zamiast exec (shell injection)** | **2026-07-28** |
| **Fix: protocol.ts — path whitelist (dozwolone tylko katalogi usera)** | **2026-07-28** |
| **Fix: electron-store z encryptionKey (maszynowy klucz)** | **2026-07-28** |
| **Fix: cover-cache busy-wait polling → Promise queue** | **2026-07-28** |
| **Fix: library.ts scheduleLoadTracksAsync polling → Promise queue** | **2026-07-28** |
| **Fix: useAudioPlayer — listener leak na remount (initCount + per-call cleanups)** | **2026-07-28** |
| **Fix: getWindowsDrives → getDrives cross-platform** | **2026-07-28** |
| **Fix: PipManager normalizeFilePath — case-sensitive tylko na Windows** | **2026-07-28** |
| **Fix: sourcemap: false → 'hidden' w electron.vite.config** | **2026-07-28** |
| **Fix: electron-builder.yml — usunięto Chinese mirror** | **2026-07-28** |
| **Fix: usunięto @types/sharp (sharp 0.35 ma własne typy)** | **2026-07-28** |
| **Fix: formatRelativeTime — Intl.RelativeTimeFormat('pl') zamiast "d ago"** | **2026-07-28** |
| **Fix: uint8ToBase64 — optymalizacja (bez apply + Array.from)** | **2026-07-28** |
| **Fix: captureVideoFrame dedup — import z player-cover zamiast kopii** | **2026-07-28** |
