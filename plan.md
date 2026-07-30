# Onda — Plan rozwoju

> Na podstawie audytu kodu 2026-07-28. Status: typecheck 0 błędów.
> Ostatnia aktualizacja: 2026-07-30 (F1-F7, FS3).

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
- [x] `trackStats` — jeden single-pass computed zamiast 5 osobnych
- [x] Deferred cover preload: `onMounted` + `requestAnimationFrame`
- [x] Ikony plików w Explorer: `getFileTypeInfo().category` → Music2/Film/Image
- [x] `VideoCard.vue` — przycisk play zmieniony z Music2 na Play
- [x] `electron.vite.config` — `audio-pip.html` dodany do `rollupOptions.input`

### Faza 3 — Audio PiP + wide + viz + covers
- [x] `AudioPipManager` — osobne BrowserWindow, IPC handlers, 3 definicje rozmiaru
- [x] `audio-pip.html` — inline JS, progress bar, play/prev/next/close, hover opacity
- [x] `useAudioPiP.ts` — kompozabl nasłuchujący `audioEvents`
- [x] Auto-show gdy `document.hidden` + gra audio, auto-hide gdy powrót
- [x] wide tryb (full-width × 36px, transport, czas, volume, 4 presety EQ)
- [x] Canvas viz 60fps: 192 bary, smoothstep, glow, peak dots
- [x] Okładki: obsługa typu video (sibling video cover → `<video>`)
- [x] Stan shuffle/repeat: podświetlenie przycisków + repeat one
- [x] Window config: `transparent: true`, `hasShadow: false`, `frame: false`
- [x] `audioPipMode` / `audioPipOpacity` / `audioPipAutoShow` / `pipWide` w typach

### Fix powielania pierwszego utworu w playlistach
- [x] `slice(1)` dla queue we wszystkich play actions

### Faza 4 — Video PiP: Vue + theme reactivity + optymalizacja
- [x] `pip.html` → Vue SFC z JASSUB, theme listenerem `pip:theme`
- [x] `App.vue` — `applyTheme()` wysyła `themeVars` do video PiP
- [x] Przycisk Maximize → zamyka PiP, wznawia w `/player`
- [x] Settings overlay (subs, brightness/contrast, pre-buffer)
- [x] Bugfixy: Maximize zamyka całkowicie, `pip:closed` zawsze aktualizuje store, `structuredClone` try-catch
- [x] i18n: `pip:locale` IPC
- [x] Maximize wchodzi w fullscreen

### Faza 5 — Library view toggle + Top menu
- [x] `LibrarySettings { viewModes }` typy + `DEFAULT_LIBRARY`
- [x] `LibraryTrackCard.vue` + `LibraryVideoRow.vue`
- [x] `LibraryView.vue` — viewMode toggle (list/grid) per tab
- [x] `AppMenu.vue` — View dropdown z Alt+1..6
- [x] i18n: `menu.downloads`, `library.viewModeList/Grid`

### Fix session 2 (post-F5)
- [x] Settings save — `JSON.parse(JSON.stringify())` zamiast Proxy przez IPC
- [x] Audio PiP — double-click przywraca główne okno
- [x] `LibraryTrackCard` — akcje na okładkę, aspect ratio 4:3
- [x] `LibraryView.vue` — ResizeObserver dla gridów

### Faza 6 — Explorer tabs/drag + Audio visualization
- [x] `ExplorerTab` typ + store — `tabs`, `addTab`, `closeTab`, `switchTab`, `activeTabIndex`
- [x] `ExplorerView.vue` — pasek zakładek nad breadcrumb z × do zamykania, + do dodawania
- [x] Drag&drop — `@dragstart` w GridItem/TableRow/inline, `@drop` na content, nav pane, breadcrumb, zakładki
- [x] `VisualizationSettings` typy + `DEFAULT_PLAYBACK.visualization`
- [x] `AudioVisualizer.vue` — tryby circle/bars/wave/particles/radial, kolory/czułość z settings
- [x] `AudioView.vue` — stacked layout (cover, viz, controls w pionie) + split ratio slider
- [x] `AudioVizSettings.vue` — panel ustawień wizualizacji
- [x] `settings.ts` — `Object.assign` zamiast `=` w `load()` (zachowanie nowych pól)

### Faza 7 — Explorer drag refinements + band select
- [x] **IPC `fs:move`** — `rename` + fallback `copyRecursive` + `rm` dla cross-volume
- [x] **IPC `fs:copy`** — `copyFile`/`copyRecursive` z `lstat` do rozróżnienia plik/folder
- [x] **NavPane drop** — `@dragover`/`@drop`/`@dragleave`, `dropTargetPath` null fix (This PC bug)
- [x] **Breadcrumb drop** — `dragEnterCount` anty-reset, highlight na każdym segmencie
- [x] **Content area drop** — przeciągnięcie z innego folderu → move/copy
- [x] **Custom confirm** — `showConfirm` przez provide/inject, zamiast system `confirm()`
- [x] **Tab (zakładka) drop** — highlight, auto-switch po 600ms, drop przenosi/kopiuje
- [x] **Multi-file drag** — dragstart zbiera wszystkie zaznaczone pliki (`\n`-separated)
- [x] **Folder dragging** — usunięto `!item.isDirectory` — foldery też przeciągalne
- [x] **TableRow draggable** — dodano `:draggable` + `@dragstart`
- [x] **IPC types** — dodano `fs:move`, `fs:copy` do `IpcChannels`
- [x] **Drag cancel fix** — `@dragover.prevent` na flex column parent
- [x] **Crash fix** — usunięto `className?.slice(0,60)` (crash na SVGAnimatedString)
- [x] **Band (marquee) select** — prostokąt overlay, overlap hit-test
- [x] **data-file-path** — dodano atrybut na wszystkich przyciskach plików
- [x] **i18n** — `alwaysOnTop`, `confirmBeforeMove`, `moveConfirm`, `copyConfirm`, `libraryFolder`, `nItems`

### Fix session 3 (post-F7)
- [x] **`effectAllowed='all'`** — Ctrl+drag nie pokazuje "no drop" (było `'move'`)
- [x] **`fs:move` no-op skip** — pomija rename gdy src === dest
- [x] **`console.error` w catch** — zastąpiono ciche `catch {}` w `fs:move`/`fs:copy`
- [x] **`addTab` nie blokuje** — `idx !== activeTabIndex.value` (pozwala stworzyć drugą zakładkę na tej samej ścieżce)
- [x] **`watch(currentPath)`** — aktualizuje `tab.path` i `tab.label` (switchTab wraca do właściwej ścieżki)
- [x] **Highlight folderów w drag** — `onContentDragOver` ustawia `hoveredFolderPath` przez `closest('[data-folder-path]')`
- [x] **Grid/Table hover prop** — dodano `hoveredFolderPath` prop + klasa ring do `ExplorerGridItem` i `ExplorerTableRow`
- [x] **Drop na podfolder w content area** — `onContentDrop` używa `hoveredFolderPath.value || explorer.currentPath`
- [x] **i18n w zakładkach** — `tab.label || $t('explorer.thisComputer')` (Ten komputer / This computer)
- [x] **i18n locale w localStorage** — `detectLocale()` sprawdza `localStorage` przed `navigator.language`, zapis przy zmianie w Settings/App.vue

---


## 📋 Pozostałe zadania

### Faza 8 — Explorer jako osobne okno
**Priorytet: 🟡 ŚREDNI | Czas: ~3h**
- [ ] Przycisk "Window" na pasku zakładek + skrót `Ctrl+Shift+N`
- [ ] IPC `browserWindow:createExplorer(path?)` — otwiera nowe `BrowserWindow`
- [ ] Route `/explorer/window/:id` → `ExplorerWindowView.vue`
- [ ] Komunikacja między oknami przez IPC bridging
- [ ] Zamykanie `Ctrl+W` — zamyka tylko to okno

### Faza 9 — Drag tab ↔ window
**Priorytet: 🟢 NISKI | Czas: ~2h**
- [ ] Tab → okno — drag tab poza pasek → IPC `createExplorer(path)` + `closeTab()`
- [ ] Okno → tab — "Pin as tab" lub drag do głównego okna
- [ ] Wizualny feedback podczas przeciągania nad pasek zakładek

### Faza 10 — Cross-window drag plików
**Priorytet: 🟢 NISKI | Czas: ~3h**
- [ ] Drag pliku między oknami — `dataTransfer` z `application/x-onda-file`
- [ ] Drag folderu między oknami
- [ ] IPC bridging przez main process

### Faza 11 — Dalsze usprawnienia
**Priorytet: 🟢 NISKI**
- [ ] Image viewer w library
- [ ] Własne skróty klawiszowe w settings
- [ ] Playlisty z drag&drop reorder
- [ ] Historia odtwarzania z statystykami
- [ ] **Tab reorder** — przeciąganie zakładek w pasku (brak `draggable` na tabach)

---

## Macierz zależności

| Faza | Zależy od | Status |
|------|-----------|--------|
| **F1** Settings | — | ✅ |
| **F2** Library perf | — | ✅ |
| **F3** Audio PiP | F1 | ✅ |
| **F4** Video PiP | — | ✅ |
| **F5** Library UI | F2 | ✅ |
| **F6** Explorer+Viz | F1 | ✅ |
| **F7** Drag refinements | F6 | ✅ |
| **F8** Explorer windowing | F6+FS3 | ⬜ |
| **F9** Tab ↔ window drag | F8 | ⬜ |
| **F10** Cross-window drag | F9 | ⬜ |
| **FS3** Fix session 3 | F7 | ✅ |
