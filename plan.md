# Onda — Plan rozwoju

> Na podstawie audytu kodu 2026-07-28. Status: typecheck 0 błędów, testy 141/141.
> Ostatnia aktualizacja: 2026-07-28 (po realizacji F1-F3).

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

### Faza 3b — Audio PiP: średni i max tryb + UI settings

**Czas: ~4-5h | Priorytet: 🔴🔴🔴 KRYTYCZNY**

**Brakujące elementy:**

**A. `audio-pip.html` — layout dla medium (400×120px):**
- Dodać `<div id="cover">` dla okładki (np. 64×64px)
- Dodać artystę (`<div id="ar">`)
- Volume slider
- Większe kontrolki + czas (currentTime / duration)
- Przełączać layout na podstawie `data.mode` z IPC

**B. `audio-pip.html` — layout dla max (full-width, 1/10 ekranu):**
- Pełna szerokość ekranu, okładka 100×100px
- Shuffle / repeat przyciski
- Volume slider z wyświetlaniem wartości
- AudioVisualizer jako półprzezroczyste tło (canvas)
- Czas: currentTime / duration
- Przezroczystość paska

**C. `SettingsPiP.vue` — sekcja Audio PiP:**
- Tryb: minimal / medium / max (select lub przyciski)
- Przezroczystość (slider 0.1–1.0)
- Auto-show toggle (gdy app w tle)
- Pozycja okna Audio PiP (bottom-right / bottom-left / top-right / top-left)

**D. Position dla Audio PiP:**
- Dodać `audioPipPosition` do `AppearanceSettings` w `types/settings.ts`
- Domyślna wartość `'bottom-right'`
- `AudioPipManager.positionWindow()` — używać `audioPipPosition` zamiast hardcoded

---

### Faza 4 — Video PiP optymalizacja + przyciski

**Czas: ~3-4h | Priorytet: 🟡 ŚREDNI**

- Pre-buffer: zacząć buforować video w pip.html ZANIM okno jest widoczne
- Synchronizacja seek: gdy PiP startuje, od razu seek do `player.currentTime`
- Przyciski w pip.html:
  - Maximize → zamknij PiP, otwórz `/player` z danym trackiem
  - Settings → overlay z filtrami/napisami
- `SettingsPiP.vue` — dodać opcje pre-buffera

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
| **F3b** Audio PiP (medium/max + UI) | F3a | ⬜ |
| **F4** Video PiP | — | ⬜ |
| **F5** Library UI | F2 ✅ | ⬜ |
| **F6** Explorer+Viz | F1 ✅ | ⬜ |
