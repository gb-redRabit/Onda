# Eksplorator — Plan Przebudowy

## Cel

Przebudowa widoku Explorer na wzór Windows 11 Eksploratora plików + dodanie
przeglądarki obrazów, pokazu slajdów oraz integracji z biblioteką.

---

## Faza 1: Podstawy — IMAGE_EXTS + widoczność obrazów

### 1.1 Stałe IMAGE_EXTS

**Pliki:**
- `src/shared/constants.ts` — dodać `IMAGE_EXTS`
- `src/renderer/src/utils/constants.ts` — dodać `SUPPORTED_IMAGE_FORMATS`
- `src/renderer/src/views/ExplorerView.vue` — rozszerzyć `MEDIA_EXTS` o obrazki

**Extensions:** `.jpg`, `.jpeg`, `.png`, `.webp`, `.svg`, `.bmp`, `.gif`, `.ico`, `.tiff`, `.avif`

### 1.2 ExplorerView — pokazywanie plików obrazów

- Explorer już pokazuje wszystkie pliki (ignore tylko `.`). Obrazy są już widoczne —
  ale `MEDIA_EXTS` w `handleDoubleClick` nie zawiera rozszerzeń obrazów,
  więc dwuklik na obrazek nie robi nic. Dodać obrazki do zbioru.

### 1.3 Routing obrazów

- Dwuklik na obrazek → otwiera `ImageViewer` (nowy widok lub modal)
- Nowa trasa `/imageviewer` lub overlay modalny zamiast routingu

---

## Faza 2: UI Explorer — Windows 11 Styl ✅ UKOŃCZONA

### 2.1 Navigation Pane (lewy panel)

**Wzór:** Windows 11 — Szybki dostęp, Dyski, Foldery

```
┌─────────────────────────────────────────────┐
│ 🗀 Szybki dostęp                             │
│   ├ 📁 Pulpit                               │
│   ├ 📁 Pobrane                              │
│   └ 📁 Obrazy                               │
│ 🖥 Ten komputer                              │
│   ├ 💾 Dysk lokalny (C:)                     │
│   ├ 💿 Dane (D:)                             │
│   └ 💿 Video (E:)                            │
│ 📁 Biblioteka (foldery w librarce)           │
│   ├ 📁 Muzyka                                │
│   ├ 📁 Filmy                                 │
│   └ 📁 (foldery z biblioteki) — znacznik ✅  │
└─────────────────────────────────────────────┘
```

**Implementacja:**

- Nowy komponent: `ExplorerNavPane.vue`
- Drzewiasta struktura (recurrence podobnie jak `DirNode.vue`)
- Dwie sekcje: "Szybki dostęp" (ulubione / pinned), "Ten komputer" (dyski + foldery)
- **Biblioteka** — sekcja pokazująca foldery z `library.folders` z ikoną ✅
- Szerokość: resize'owalna (jak Sidebar)
- Stan: `explorer.navExpanded` (collapse/expand)

**Wymaga IPC:**
- `library:loadFolders` — już istnieje

### 2.2 Command Bar (górny pasek narzędzi)

**Wzór:** Windows 11 — Nowy folder, Sortuj, Widok, ...

```
[Nowy folder] [❌ Wytnij] [📋 Kopiuj] [📌 Wklej] [🗑 Usuń] [↻ Odśwież]
[🔍 _____________________________] [☰ Widok] [↑↓ Sortuj]
```

**Implementacja:**

- Nowy komponent: `ExplorerToolbar.vue`
- Przyciski dla operacji na plikach (część już istnieje przez IPC)
- Pole wyszukiwania z `debounce` 300ms
- Dropdown sortowania (Nazwa, Data modyfikacji, Typ, Rozmiar)
- Toggle grid/list (już istnieje w ExplorerView)

**Wymagane IPC:**
- `fs:mkdir` — już istnieje
- `fs:delete` — już istnieje
- `fs:rename` — już istnieje

### 2.3 Grid View — miniatury (jak Windows 11)

**Wzór:** Windows 11 — duże/średnie/małe ikony z nazwami

- Dla obrazków: **rzeczywista miniatura** (nie ogólna ikona)
- Dla filmów: **klatka z wideo** (już istnieje przez `media:getCover`)
- Dla audio: **okładka audio** (już istnieje przez `media:getCover`) lub ikona
- Dla folderów: ikona folderu
- Size: `extra-large` (256px), `large` (128px), `medium` (64px), `small` (32px), `list` (16px)

**Implementacja:**

- Nowy komponent: `ExplorerGridItem.vue` — pojedynczy kafelek
- Wirtualizacja (jak LibraryView z `@tanstack/vue-virtual`)
- Sizes slider/buttons w Toolbar

### 2.4 List View — kolumny + detale

**Wzór:** Windows 11 — kolumny: Nazwa, Data modyfikacji, Typ, Rozmiar

- Sortowanie przez kliknięcie nagłówka kolumny
- Możliwość przeciągnięcia kolumn (reorder)
- Checkboxy dla multi-select (jak W11)
- Details pane (dolny pasek: "N elementów zaznaczonych | Rozmiar: XXX")

**Implementacja:**

- Modyfikacja istniejącego list view w ExplorerView lub nowy komponent
- `ExplorerTableRow.vue` — wiersz tabeli z danymi

### 2.5 Preview Pane (prawy panel — opcjonalnie)

**Wzór:** Windows 11 — podgląd pliku bez otwierania

- Dla obrazków: miniatura + wymiary + rozmiar
- Dla audio/wideo: cover + metadata + duration
- Dla folderów: liczba plików wewnątrz (już liczone w library scan)

---

## Faza 3: Image Viewer ✅ UKOŃCZONA (wszystkie elementy zintegrowane w ImageViewer.vue)

### 3.1 Nowy widok / modal

**Projekt:**
- Overlay na pełnym oknie (nie routing — szybciej)
- Czarny / bardzo ciemny background
- Obraz wyśrodkowany, `object-fit: contain`
- Zawsze na wierzchu (over current view)

### 3.2 Sterowanie

- **← / →** — poprzedni/następny obraz (z listy plików w bieżącym folderze)
- **Esc** — zamknij
- **+ / -** — zoom
- **0** — dopasuj do okna (fit)
- **R** — rotate 90°
- **F** — fullscreen
- **Spacja** — play/pauza pokazu slajdów
- Strzałki na ekranie (left/right area click → poprzedni/następny)

### 3.3 Bottom panel

- Nazwa pliku, rozmiar, wymiary (px), data modyfikacji
- Miniaturki nawigacyjne (filmstrip: pasek miniaturek na dole)
- Przycisk ♡ (ulubione — jeśli obraz dodany do ulubionych w player store)

### 3.4 EXIF

- Przycisk "i" (info) → panel z danymi EXIF
- Aparat, przysłona, czas naświetlania, ISO, ogniskowa, data zrobienia
- GPS coordinates (jeśli dostępne)

**Wymagane IPC:**
- `media:readExif` — nowy handler: `exif-reader` lub `sharp` do odczytu EXIF

---

## Faza 4: Pokaz Slajdów (Slideshow) ✅ UKOŃCZONA

### 4.1 Uruchamianie

- Z kontekstowego menu na obrazku/folderze: "Pokaz slajdów"
- Z ImageViewera: przycisk ▶ lub Spacja
- Z zaznaczonych obrazków: "Pokaz slajdów z zaznaczonych"

### 4.2 Sterowanie

- **Play / Pause** — Spacja lub klik
- **← / →** — poprzedni/następny
- **Esc** — zakończ
- **F** — fullscreen
- **1-5** — szybkość (1=3s, 2=5s, 3=8s, 4=15s, 5=30s)
- **R** — losowa kolejność (shuffle)
- **L** — zapętlanie (loop)

### 4.3 Przejścia

- **Fade** (domyślne) — płynne zanikanie/przejaśnianie
- **Slide** — przesuwanie w lewo/prawo
- **Zoom** — powiększanie nowego obrazka
- **Brak** — natychmiastowa zmiana
- CSS transitions na `<img>` lub canvas

### 4.4 Interfejs

- Minimalistyczny overlay z:
  - Pasek postępu (na dole: "3/42")
  - Przyciski: pauza, poprzedni, następny, szybkość
  - Automatycznie ukrywa się po 3s (jak PlayerOSD)

---

## Faza 5: Context Menu ✅ UKOŃCZONA

### 5.1 Dla plików (obrazki)

| Opcja                  | Akcja                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| Odtwórz                | Jeśli audio/wideo: graj. Jeśli obrazek: otwórz ImageViewer          |
| Podgląd                | Otwórz ImageViewer (dla obrazków)                                   |
| Pokaz slajdów          | Rozpocznij slideshow od tego obrazka                                |
| Ustaw jako okładkę     | `media:writeCover` — ustaw jako okładkę utworu (dla obrazków)      |
| Dodaj do kolejki       | Dodaj do kolejki odtwarzacza (dla audio/wideo)                      |
| Dodaj do playlisty     | Dodaj do playlisty (dla audio/wideo)                                |
| Kopiuj                 | Kopiuj ścieżkę lub plik                                             |
| Zmień nazwę            | `fs:rename` — inline edit                                           |
| Usuń                   | `fs:delete` — z confirm dialog                                      |
| Właściwości            | Pokaż szczegóły pliku (rozmiar, wymiary, EXIF)                      |
| Pokaż w folderze       | Otwórz folder rodzica (już istnieje)                                |

### 5.2 Dla folderów

| Opcja                       | Akcja                                                  |
| --------------------------- | ------------------------------------------------------ |
| Otwórz                      | Wejdź do folderu                                       |
| Odtwórz wszystkie           | `playTracks` wszystkie audio/wideo w folderze          |
| Dodaj wszystkie do kolejki  | `addToQueue` wszystkie audio/wideo w folderze          |
| **Dodaj folder do biblioteki** | `library:saveFolders` + `library:scan`              |
| Usuń folder z biblioteki    | `library:saveFolders` — usuń z listy                   |
| **Oznaczony ✅**            | Folder już w bibliotece → ikona ✅ + "Usuń z biblioteki" |
| Zmień nazwę                 | `fs:rename`                                            |
| Usuń                        | `fs:delete` — rekurencyjnie                            |
| Właściwości                 | Rozmiar, liczba plików, data modyfikacji               |

### 5.3 Oznaczanie folderów bibliotecznych

- W `explorer` store dodać `libraryFolderPaths: Set<string>` (ładowane z `library:loadFolders`)
- Przy każdym folderze wyświetlanym w explorer → sprawdź czy ścieżka lub jej rodzic jest w `libraryFolderPaths`
- Jeśli tak: overlay badge ✅ na ikonie folderu
- Context menu: "Usuń z biblioteki" zamiast "Dodaj do biblioteki"

---

## Faza 6: Propozycje Dodatkowe

### 6.1 Quick Access (Ulubione foldery)

- Użytkownik może przypiąć folder do "Szybki dostęp" (jak Windows 11)
- Pin/unpin z context menu folderu
- Przechowywane w `explorer` store + persistencja przez `settings:set`

### 6.2 Duplicate file detection

- Skanuj folder → znajdź duplikaty (po nazwie + rozmiarze lub MD5)
- Pokaż wyniki w osobnym panelu
- Batch usuwanie duplikatów

### 6.3 Batch rename

- Zaznacz pliki → "Zmień nazwę" → wzór: `Nazwa (1).ext`, `Nazwa (2).ext`, ...
- Custom template: `{artist} - {title}.ext` (z metadanych)

### 6.4 Archive handling

- Wyświetlanie `.zip`, `.rar`, `.7z` jako folderów
- Podgląd zawartości (lista plików w archiwum)
- Wymaga: `7z` lub własnego parsera

### 6.5 Split pane (jak Total Commander)

- Dwa panele explorer obok siebie
- Drag & drop między panelami (kopiowanie/przenoszenie plików)
- Sync browsing (obie strony nawigują razem)

### 6.6 Network drives

- Wyświetlanie dysków sieciowych w "Ten komputer"
- Mapowanie dysków sieciowych

### 6.7 Trash / Recycle Bin

- Zamiast `fs:delete` (permanent delete) → przenieś do Kosza
- `shell.moveItemToTrash(path)` — Electron API

---

## Faza 7: Kolejność Implementacji

```
Priority: WYSOKI
├── TYDZIEŃ 1:  Faza 1 (IMAGE_EXTS) + Faza 2.1 (Navigation Pane)
│                + Faza 2.2 (Command Bar)
├── TYDZIEŃ 2:  Faza 2.3 (Grid thumbnails) + Faza 2.4 (List view)
├── TYDZIEŃ 3:  Faza 3 (Image Viewer)
├── TYDZIEŃ 4:  Faza 4 (Slideshow)
├── TYDZIEŃ 5:  Faza 5 (Context menu)

Priority: NISKI
├── TYDZIEŃ 6+: Faza 6 (Quick Access, Duplicates, Batch rename, Split pane)
```

---

## Nowe pliki do utworzenia (~12)

| Plik                                               | Opis                                          |
| -------------------------------------------------- | --------------------------------------------- |
| `ExplorerNavPane.vue`                              | Lewy panel nawigacyjny (drzewo folderów)      |
| `ExplorerToolbar.vue`                              | Górny pasek narzędzi + wyszukiwarka           |
| `ExplorerGridItem.vue`                             | Kafelek grid view (z miniaturami)             |
| `ExplorerTableRow.vue`                             | Wiersz list view                              |
| `ExplorerDetailsPane.vue`                          | Dolny panel detali (opcjonalnie)              |
| `ImageViewer.vue`                                  | Podgląd obrazu (overlay)                      |
| `ImageViewerControls.vue`                          | Kontrolki ImageViewer (toolbar)               |
| `ImageViewerFilmstrip.vue`                         | Pasek miniaturek na dole                      |
| `SlideshowOverlay.vue`                             | Overlay pokazu slajdów                        |
| `ImageSlideshow.vue`                               | Logika slideshow (composable)                 |
| `ExplorerContextMenu.vue`                          | Konfiguracja context menu (opcje folderów)    |
| `composables/useImageSlideshow.ts`                 | Slideshow logic (timer, transition, shuffle)  |

## Zmodyfikowane pliki (~10)

| Plik                               | Zmiany                                          |
| ---------------------------------- | ----------------------------------------------- |
| `ExplorerView.vue`                 | Wstawić NavPane + Toolbar + Grid/List + detale  |
| `explorer.ts` (store)              | quickAccess, navExpanded, searchQuery           |
| `explorer.ts` (types)              | Nowe typy (ImageViewerState, SlideshowState)    |
| `shared/constants.ts`              | `IMAGE_EXTS`                                   |
| `renderer/utils/constants.ts`      | `SUPPORTED_IMAGE_FORMATS`                      |
| `handlers.ts`                      | `media:readExif`, `media:getThumbnail`         |
| `preload/index.ts`                 | `readExif`, `getThumbnail`                     |
| `preload/index.d.ts`               | Typy dla nowych API                            |
| `shared/types/ipc.ts`              | Nowe kanały IPC                                |
| `App.vue`                          | ImageViewer overlay + slideshow overlay        |

## Nowe IPC handlery

| Handler                  | Opis                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `media:getThumbnail`     | Generuje miniaturkę obrazka (256px) przez `nativeImage.resize`     |
| `media:readExif`         | Odczytuje metadane EXIF z JPEG/TIFF                                |
| `media:readImage`        | Czyta obrazek i zwraca base64 + wymiary                            |
| `media:listDir`          | Rozszerzony fs:readdir — zwraca też thumbnail paths i typ folderu  |
| `media:folderSize`       | Oblicza rekurencyjnie rozmiar folderu                              |

## Zależności

| Pakiet             | Cel                                        |
| ------------------ | ------------------------------------------ |
| `exif-reader`      | Odczyta EXIF z JPEG/TIFF (lekki, 0 deps)   |
| `sharp` (opcjonalnie) | Szybsze generowanie miniaturek + EXIF    |

---

## Architektura ImageViewer / Slideshow

```
App.vue
├── ImageViewer.vue (overlay, renderIf(imageViewerState))
│   ├── <img> lub <canvas> z obrazem
│   ├── ImageViewerControls.vue (toolbar)
│   └── ImageViewerFilmstrip.vue (pasek miniaturek)
│
└── SlideshowOverlay.vue (overlay, renderIf(slideshowState))
    ├── <img> z przejściami CSS
    └── SlideshowControls.vue (play/pause, prev/next, speed)

useImageSlideshow.ts (composable)
├── files: Ref<string[]>
├── currentIndex: Ref<number>
├── isPlaying: Ref<boolean>
├── speed: Ref<number> (seconds per slide)
├── shuffle: Ref<boolean>
├── loop: Ref<boolean>
├── transition: Ref<'fade' | 'slide' | 'zoom' | 'none'>
├── start(files, startIndex)
├── next(), prev(), play(), pause(), togglePlay()
├── setSpeed(s), setTransition(t)
└── cleanup() — clear timers, reset state
```

---

## Integracja z istniejącymi systemami

| System              | Integracja                                                             |
| ------------------- | ---------------------------------------------------------------------- |
| **Library**         | Wskazanie folderów bibliotecznych w NavPane + context menu "Dodaj/Usuń" |
| **Player**          | Dwuklik na audio/wideo → `player.setTrack()` (już działa)              |
| **Queue**           | Drag & drop z explorer do kolejki (rozszerzenie istniejącego DnD)       |
| **Favorites**       | ♡ w ImageViewer → `player.toggleFavorite(path)`                        |
| **Media Cover**     | Miniatury w grid view → `media:getCover` (już istnieje)                |
| **Playlisty**       | "Dodaj do playlisty" w context menu plików (już istnieje)              |
| **Toast**           | Powiadomienia o operacjach (rename, delete, add to library)            |
