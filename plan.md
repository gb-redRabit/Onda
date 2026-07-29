# Onda — Plan rozwoju

> Na podstawie audytu kodu 2026-07-28. Status: typecheck 0 błędów, testy 141/141.
> Ostatnia aktualizacja: 2026-07-29 (F1-F4 + fixy).

---

## ✅ Zrealizowane

### Faza 1 — Fundament (Settings + i18n + Drobne fixy)

- [x] `settings.save()` — debounce 300ms
- [x] `ui.sidebarExpanded` → przeniesione do `settings.appearance`
- [x] `explorer.viewMode` → zapisywane do settings
- [x] `explorer.sortBy` / `explorer.sortOrder` → zapisywane do settings
- [x] `App.vue` — `applyTheme()` wołane PO `settings.load()` (race condition fix)
- [x] i18n — auto-detect locale z `navigator.language`
- [x] `Sidebar.vue` — usunięty dualny stan `ui.sidebarExpanded` / `collapsed`

### Faza 2 — Library freeze fix

- [x] `shallowRef` dla `tracks` — brak triggera dla computed na każdym dodaniu
- [x] `trackStats` — jeden single-pass computed zamiast 5 osobnych (audioCount, videoCount, artists, albums)
- [x] Deferred cover preload: `onMounted` + `requestAnimationFrame` zamiast natychmiast
- [x] Ikony plików w Explorer: `getFileTypeInfo().category` → Music2/Film/Image
- [x] `VideoCard.vue` — przycisk play zmieniony z Music2 na Play
- [x] `electron.vite.config` — `audio-pip.html` dodany do `rollupOptions.input`

### Faza 3 — Audio PiP (częściowo)

- [x] `AudioPipManager` (main process) — osobne BrowserWindow, IPC handlers, 3 definicje rozmiaru
- [x] `audio-pip.html` — inline JS, progress bar, play/prev/next/close, hover opacity, CSP
- [x] `useAudioPiP.ts` — kompozabl nasłuchujący `audioEvents` (timeUpdate, durationChange, playStateChange)
- [x] Auto-show gdy `document.hidden` + gra audio, auto-hide gdy powrót
- [x] Progress bar: time + duration z `audioEvents`, seek przez `audioEngine.seek()`
- [x] Hover: opacity w górę na hover, nie nadpisywany przez IPC ticki
- [x] Window config: `transparent: true`, `hasShadow: false`, `frame: false`
- [x] Rejestracja IPC: `audio-pip:show/hide/update/timeUpdate/progressClick/action`
- [x] Integracja z `App.vue` + main/index.ts + window-ipc.ts
- [x] `audioPipMode` / `audioPipOpacity` / `audioPipAutoShow` w typach + constants

### Fix powielania pierwszego utworu w playlistach

- [x] `LibraryView.vue` — `playTracks()`: `slice(1)` dla queue
- [x] `LibraryPlaylistManager.vue` — `playAll()`: `slice(1)` dla queue
- [x] `Sidebar.vue` — `playPlaylist()`: `slice(1)` dla queue
- [x] `DirNode.vue` — `playDir()`: `slice(1)` dla queue

---

## 📋 Pozostałe zadania

---

### Faza 3c — Audio PiP: wide tryb + wizualizacja + okładki wideo + stan przycisków ✅

- [x] 4. wide tryb (full-width × 36px, cienki pasek, transport, czas, volume, 4 presety EQ)
- [x] Canvas wizualizacja: 192 bary (3×64), smoothstep interpolacja, glow, peak dots
- [x] Wizualizacja 60fps: geometria cachowana, fillRect zamiast roundRect/shadowBlur, brak getComputedStyle/gradient/klatkę
- [x] Dane frequency co 60ms przez osobny kanał IPC `audio-pip:vizData`
- [x] Okładki: obsługa typu video (sibling video cover → `<video>` z media server)
- [x] Stan shuffle/repeat: podświetlenie przycisków (!text-accent-base) + repeat one z "1" overlay
- [x] Settings: pipWide w UI + typy + locale (pl/en)

---

### Faza 4 — Video PiP: Vue + theme reactivity + optymalizacja

**Czas: ~3-4h | Priorytet: 🟡 ŚREDNI**

- [x] `pip.html` → Vue SFC (`pip-video/App.vue`) z JASSUB, theme listenerem `pip:theme`
- [x] `pip-manager.ts` — handler `pip:theme`, przechowywanie cssVars
- [x] `App.vue` — `applyTheme()` wysyła `themeVars` do video PiP (`pip:theme`)
- [x] Usunięto logi debug: `extractEmbedded`, `dump_all failed`, `extracted fonts`
- [x] Pre-buffer: ustawienie `pipPreBuffer` w settings + automatyczne `pip.preload()` przy `setupVideo()`
- [x] Przycisk Maximize (&#x26F6;) w PiP → wysyła `pip:maximize` → zamyka PiP, wznawia w `/player`
- [x] Przycisk Settings (&#x2699;) w PiP → overlay z toggle napisów, suwakami brightness/contrast (CSS filter)
- [x] `SettingsPiP.vue` — toggle Pre-buffer video
- [x] Bugfix: Maximize teraz woła `pipManager.stop()` zamiast tylko `hide()` — zamyka PiP całkowicie
- [x] Bugfix: `pip:closed` globalny handler w `App.vue` — zawsze aktualizuje store, nawet bez PlayerView
- [x] Bugfix: `onClosed` czyści `player.pipTime`, `setTrack()` czyści `pipTime`
- [x] Bugfix: `structuredClone` w `useSubtitleRenderer` objęty try-catch
- [x] Bugfix: IPC invoke/send w preload objęte try-catch
- [x] i18n: `pip:locale` IPC — locale przesyłana z App.vue do PiP, PiP reaguje na zmianę
- [x] Bugfix: `init()` nie woła `pip.loadTrack()` gdy PiP aktywny — tylko update napisów
- [x] Maximize wchodzi w fullscreen (`toggleFullscreen()` + `pendingFullscreen`)

---

### Faza 5 — Library view toggle + Top menu

**Czas: ~3-4h | Priorytet: 🟡 ŚREDNI**

- `LibraryView.vue` — dodać `viewMode` (list/grid) dla każdej zakładki
- Nowe komponenty: `LibraryTrackCard.vue`, `LibraryVideoRow.vue`
- `AppMenu.vue` — przebudowa z nawigacją do widoków
- Skróty klawiszowe Alt+1..N dla widoków

---

### Faza 6 — Explorer tabs/drag + Audio visualization

**Czas: ~4-5h | Priorytet: 🟢 NISKI**

- `ExplorerStore` — dodać `tabs: Array<...>`, `activeTabIndex`
- `ExplorerView.vue` — pasek zakładek nad breadcrumb
- Drag&drop między panelem a listą
- `settings.playback.visualization` — typ, kolory, czułość
- `AudioVisualizer.vue` — nowe tryby (wave, circle, particles)
- `AudioView.vue` — suwak do proporcji w split layout

---

### Faza 7 — Dalsze usprawnienia (na później)

**Priorytet: 🟢 NISKI**

- Multi-window Explorer
- Image viewer w library
- Własne skróty klawiszowe w settings
- Playlisty z drag&drop reorder
- Historia odtwarzania z statystykami

---

## Macierz zależności (po F1-F3)

| Faza | Zależy od | Zrealizowane? |
|------|-----------|---------------|
| **F1** Settings | — | ✅ |
| **F2** Library perf | — | ✅ |
| **F3a** Audio PiP (minimal) | F1 | ✅ |
| **F3b** Audio PiP (medium/max + UI) | F3a | ✅ |
| **F3c** Audio PiP (wide + viz + covers) | F3b | ✅ |
| **F4** Video PiP (Vue + theme) | — | ✅ |
| **F5** Library UI | F2 ✅ | ⬜ |
| **F6** Explorer+Viz | F1 ✅ | ⬜ |
