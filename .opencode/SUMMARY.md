# Onda — Summary

## Completed

### Core
- Virtualized track list / video grid / album grid / artists (`@tanstack/vue-virtual`)
- Cover cache with `triggerRef` (`stores/player.ts`)
- `toFileUrl` / `toMediaServerUrl` helper (`utils/mediaUrl.ts`) — 6 call sites unified
- Settings components code-split via `defineAsyncComponent`

### Stabilizacja i optymalizacja (analiza.md / plan.md / raport.md)
- `app:quit` handler, media-server token auth (crypto.randomUUID, no CORS `*`)
- Tray/global media shortcuts wired in `App.vue`; `fs:readdir` try/catch + toast
- `useThumbnail` guard `window.api?.`; LRU eviction per-cache (`thumbLoader.ts`)
- PiP `DataCloneError` fix — clean (non-reactive) subtitle data copies, no `structuredClone`
- Typed IPC: generic `invoke<C extends IpcChannel>` in preload + renderer, `IpcChannels` map complete
- `disconnectVideoElement` routing restore; `installYtdlp` cross-platform; `runCommand` via `spawn` (no shell) in `main/utils/exec.ts`
- `any` sweep (useSubtitleRenderer, MusicBrainzLookup, preload d.ts, library.ts, musicbrainz.ts)
- ModuleManager lifecycle optional `deactivate`/`destroy`; `settings:get/set` typed `Partial<AppSettings>`
- Subtitle conversion logic extracted to `utils/subtitleConvert.ts` (27 tests)
- 190/190 tests pass; typecheck/lint/build OK (2026-08-03)

### Refaktoryzacja największych plików (zasada 8.2)
- `LibraryView.vue` 1285 → 401 + 6 tab components (`LibraryTracksTab`, `LibraryVideoTab`, `LibraryFoldersTab`, `LibraryArtistsTab`, `LibraryImagesTab`, `LibraryAlbumsTab`) + `composables/useVirtualGrid.ts`
- `ImageViewer.vue` 758 → 617 + `ImageViewerToolbar.vue` + `utils/imageTransitions.ts`
- `ExplorerView.vue` 1531 → 609 + `ExplorerContent.vue` (565) + `ExplorerTabs.vue` + `ExplorerDuplicatesPanel.vue` + `ExplorerPropertiesDialog.vue` + `ExplorerPromptDialog.vue` + `utils/explorerTabDrop.ts`

### Bugfixy (ostatnia sesja)
- **Fullscreen w oknie eksplorera**: `window-ipc.ts` `toggleFullscreen`/`exitFullscreen`/`isFullscreen` celowały w `getMainWindow()` → teraz `BrowserWindow.fromWebContents(event.sender) ?? getMainWindow()`; okna eksplorera forwardują `enter/leave-full-screen` jako `window:fullscreenChanged`
- **Freeze przy zmianie widoku**: `ExplorerContent.vue` extraSmall — ikony ładowane dla wszystkich widocznych naraz (blokada main) + re-render po każdej ikonie → `ICON_CONCURRENCY=6` serialny `pumpIcons()` + batch render przez `scheduleIconRender` (jeden timer)

## In Progress / Not Started
- Favorites column (heart toggle per track)
- Configurable info columns
- Media server: katalog whitelist (świadomie odłożone — token w URL wystarcza)
- YouTube download/playback UI (szkielet; `yt:search` przez yt-dlp działa)
- Pozostałe pliki > limit 8.2: `pip-audio/App.vue` (659), `ExplorerContent.vue` (565), `audioEngine.ts` (495), `stores/player.ts` (491), `useVideoPlayer.ts` (427)
