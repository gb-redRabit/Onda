# Onda — Plan rozwoju

> Na podstawie audytu kodu 2026-07-28. Status: typecheck 0 błędów, eslint 0 błędów (1 pre-existing `prefer-const`), build ✓, testy 141/141.
> Ostatnia aktualizacja: 2026-07-31 (F1-F10 ✅, FS3-FS7 ✅, F11 częściowo).

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

### Duplikaty plików (post-FS3)
- [x] **`fs:findDuplicates`** — IPC w main: grupowanie po wzorcach sufiksów duplikatów OS (` - Copy/Kopiuj`, `(copy/kopia)`, `copy`, ` (2)`, ` 2`) + weryfikacja SHA-256 (tylko pliki o tej samej wielkości); fallback na pierwszy kandydat gdy oryginał usunięty
- [x] **Fix sufiksów PL** — regex obsługuje ` — kopia`/` – kopia` (em/en-dash, `\u2014`/`\u2013`) oraz ` - kopia`/` - kopiuj` (polski Windows); wykrywa `wp1334950-... — kopia.jpg`
- [x] **Przycisk w toolbarze** — ikona `Copy` obok pin, skan bieżącego folderu
- [x] **Panel boczny (overlay)** — grupy oryginał/duplikaty, checkboxy, "Zaznacz wszystkie", usuwanie wybranych z potwierdzeniem, ponowny skan + refresh po usunięciu
- [x] **i18n** — klucze `explorer.duplicates*` (pl/en)

### Kopiuj/Wytnij/Wklej (post-FS4)
- [x] **`stores/clipboard.ts`** — schowek plików (path+name, akcja copy/cut), `isCut()` dla wizualnego feedbacku
- [x] **Konflikt nazw w main** — `uniqueDestPath()` w `fs:copy`/`fs:move` (auto ` (2)`, ` (3)`… jak w Explorerze)
- [x] **Skróty** — `Ctrl+C`/`Ctrl+X`/`Ctrl+V` (obok istniejących `Ctrl+A`, `Del`, `F2`, `Enter`, `Esc`)
- [x] **Menu kontekstowe** — Copy/Cut (przy zaznaczeniu) i Paste (gdy schowek niepusty) w menu pliku i pustego obszaru
- [x] **Feedback wycięcia** — przyciemnienie (`opacity-40`) wyciętych plików w grid/lista/tabela
- [x] **i18n** — `common.copy/cut/paste` (pl/en)

### Właściwości pliku/folderu (post-FS5)
- [x] **`fs:getProperties`** — IPC: dla pliku rozmiar/daty; dla folderu rekurencyjny skan (elementy, foldery, pliki, rozmiar, limit 100k wpisów)
- [x] **Okno "Właściwości"** — modal z edytowalną nazwą (rename po OK), typ, lokalizacja, rozmiar, zawartość (folder), daty utworzenia/modyfikacji
- [x] **Menu kontekstowe** — pozycja "Właściwości" + skrót `Alt+Enter` (naprawiona kolejność przed zwykłym Enter)
- [x] **i18n** — `explorer.properties*` (pl/en)

---


### Faza 8 — Explorer jako osobne okno
**Priorytet: 🟡 ŚREDNI | Czas: ~3h** ✅
- [x] Przycisk "Window" na pasku zakładek + skrót `Ctrl+Shift+N`
- [x] IPC `explorer:create(path?)` — otwiera nowe `BrowserWindow`
- [x] Route `/explorer/window/:id` → `ExplorerWindowView.vue`
- [x] Komunikacja między oknami przez IPC bridging *(zrealizowane w F9)*
- [x] Zamykanie `Ctrl+W` — zamyka tylko to okno

### Faza 9 — Drag tab ↔ window
**Priorytet: 🟢 NISKI | Czas: ~2h** ✅
- [x] Tab → okno — drag tab poza okno (dropEffect 'none') → `explorer:create(path)` + usunięcie karty ze źródła
- [x] Tab → inne okno — drop na pasku/obszarze → `addTab(path)` + IPC `explorer:tabMoved` → źródło usuwa kartę
- [x] Okno → tab — "Pin as tab" w pasku tytułowym okna eksplorera (`explorer:sendTabToMain`) + drag w drugą stronę
- [x] Wizualny feedback podczas przeciągania nad pasek zakładek (istniejący ring `tabDropTargetIdx`, wyłączony podczas dragu karty)
- [x] `windowId` synchronicznie w preload (`window:idSync`) + bridging między oknami (F8 → F9)

### Faza 10 — Cross-window drag plików
**Priorytet: 🟢 NISKI | Czas: ~3h** ✅
- [x] Drag pliku między oknami — `text/uri-list` (file://) + `text/plain` + fallback `Files`/`webUtils.getPathForFile`
- [x] Drag folderu między oknami (drop na folderze/docelowej karcie/obszarze)
- [x] IPC bridging przez main process (move/copy przez `fs:move`/`fs:copy` w oknie docelowym)

### Fix session 4 (post-F10)
- [x] **Odświeżanie okien po move/copy** — tylko okno-docelowe wołało `loadFiles`; źródło pokazywało nieaktualne pliki. Dodano broadcast `explorer:refreshAll`: renderer wysyła po każdym move/copy (`onContentDrop`, `onTabDrop`, `pasteClipboard`, NavPane, Breadcrumb) → main rozsyła `explorer:refresh` do okna głównego + wszystkich okien eksplorera → `App.vue` przeładowuje `explorer.currentPath`
- [x] **Przeciąganie okna aplikacji po pulpicie** — na trasie `home` środkowy kontener akcji w `AppMenu.vue` miał `-webkit-app-region: no-drag`, więc cały pasek był niedraggable (działał dopiero po otwarciu drugiego okna). `no-drag` zostawiono tylko na przyciskach Home (openFile/openFolder)
- [x] **Cleanup logów debugowych** — usunięto forward logów renderer→main (`renderer:log` IPC), logi DnD/window/mounted w `ExplorerView`, `ExplorerWindowView`, `App`, `fileDrag`, `window-ipc`, `index.ts`; `logger.ts` ponownie zwykły `console`; zostawiono `logger.error`

## 📋 Pozostałe zadania

### Faza 11 — Dalsze usprawnienia
**Priorytet: 🟢 NISKI**
- [x] **Własne skróty klawiszowe w settings** — `SettingsShortcuts.vue` edytowalny (record-key), `settings.updateShortcut()` + persistencja w `settings.shortcuts`
- [ ] Image viewer w library (ImageViewer istnieje tylko w Explorer)
- [ ] Playlisty z drag&drop reorder (jest DnD do playlist, brak reorderu tracków wewnątrz)
- [ ] Historia odtwarzania — rozbudowa (jest `player.history` + QueuePanel tab + `mostPlayed`/`recentTracks` w library; brak statystyk per-utwór)
- [ ] **Tab reorder** — przeciąganie zakładek w pasku (same-window drop = no-op, komentarz w `handleTabDrop`)

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
| **F8** Explorer windowing | F6+FS3 | ✅ |
| **F9** Tab ↔ window drag | F8 | ✅ |
| **F10** Cross-window drag | F9 | ✅ |
| **FS3** Fix session 3 | F7 | ✅ |
| **FS4** Duplikaty plików | FS3 | ✅ |
| **FS5** Kopiuj/Wytnij/Wklej | FS4 | ✅ |
| **FS6** Właściwości pliku/folderu | FS5 | ✅ |
| **FS7** Fix session 4 (refresh + drag okna) | F10 | ✅ |

---

## 🔄 Do zacommitowania (niezacommitowane zmiany)

> Stan na 2026-07-31 — wszystkie poniższe zmiany są w working tree, nie w git:

| Grupa | Pliki |
|-------|-------|
| **F8-F10** (window/explorer + drag) | `window-ipc.ts`, `router/index.ts`, `ExplorerWindowView.vue` (nowy), `tabDrag.ts` (nowy), `fileDrag.ts` (nowy), `ExplorerView.vue`, `ExplorerGridItem.vue`, `ExplorerTableRow.vue`, `AppMenu.vue`, `preload/index.ts` + `.d.ts`, `ipc.ts` (shared) |
| **FS4-FS6** (duplikaty, clipboard, properties) | `fs-handlers.ts`, `ExplorerView.vue`, `stores/clipboard.ts`, locales |
| **Fix session 4** (refresh + drag okna) | `window-ipc.ts`, `App.vue`, `ExplorerNavPane.vue`, `ExplorerBreadcrumb.vue`, `AppMenu.vue`, `ExplorerView.vue` |
| **Cleanup logów** | `logger.ts`, `window-ipc.ts`, `index.ts`, `App.vue`, `ExplorerView.vue`, `ExplorerWindowView.vue`, `fileDrag.ts` |

Ostatni commit: `c40f380` "fix, and findduplicates". Sugerowany commit: F8-F10 + FS4-FS6 + fix session 4 jako osobny commit (zgodnie z konwencją `Sprint N: ...`).
