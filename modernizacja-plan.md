# Onda — Plan Modernizacji

## Stan faktyczny (audyt 2026-07-21)

### Co już działa w Bibliotece
| Komponent | Status |
|-----------|--------|
| IPC `library:scan`, `library:loadFolders`, `library:saveFolders`, `library:loadScanned`, `library:saveScanned` | ✅ |
| IPC `playlist:loadAll`, `playlist:saveAll` | ✅ |
| `library.store.ts` — `loadFromDisk()`, `scanFolders()`, `savePlaylists()`, `addFolder()`, `removeFolder()` | ✅ |
| `LibraryModule.ts` — `activate()` z auto-load + auto-scan | ✅ |
| `SettingsLibraryFolders.vue` — UI do zarządzania folderami + skanowania | ✅ |
| `LibraryPlaylistManager.vue` — panel playlist | ✅ |
| `LibraryTrackRow.vue` — wiersz z akcjami (play, cover) | ✅ |
| Wirtualizacja listy utworów (tracks tab) — `@tanstack/vue-virtual` | ✅ |
| Folder tree — rekurencyjny `DirNode.vue` | ✅ |
| Splash — zamyka się natychmiast, biblioteka ładuje w tle | ✅ |
| Cover loading — batchowany (5 IPC na ramkę przez IdleCallback) | ✅ |
| Video navigation — zawsze nawiguje do `/player` | ✅ |

### Co zostało do zrobienia

---

## Faza A: Wydajność (Priority: WYSOKI)

### A1. Wirtualizacja video tab
- **Plik:** `src/renderer/src/views/LibraryView.vue`
- **Opis:** Video tab obecnie renderuje wszystkie kafelki naraz. Dodać `useVirtualizer` z `@tanstack/vue-virtual` dla siatki video.
- **Szacowany czas:** 1h
- **Kroki:**
  1. Dodać `trackListRef` dla kontenera scrolla w video tab
  2. Stworzyć `videoVirtualizer` z `useVirtualizer` (grid z `getItemKey`, `estimateSize`)
  3. Zastąpić `v-for` w video tab wirtualizowanymi itemami

### A2. Wirtualizacja album grid
- **Plik:** `src/renderer/src/views/LibraryView.vue`
- **Opis:** Albumy tab to siatka okładek. Wirtualizacja dla gridu (useVirtualizer z `horizontal: true` lub pojedyncza kolumna z itemami).
- **Szacowany czas:** 1h

### A3. CoverCache — `reactive(Map)` → `ref<Record>`
- **Plik:** `src/renderer/src/stores/player.ts`
- **Opis:** `reactive(Map)` nie jest w pełni reaktywny — Vue nie trackuje `.set()` i `.delete()` jak należy. Zamienić na `ref<Record<string, CoverResult>>` z `triggerRef` dla wymuszenia reaktywności po modyfikacji.
- **Szacowany czas:** 30min
- **Kroki:**
  1. Zmienić `const coverCache = reactive(new Map(...))` na `const coverCache = ref<Record<string, { type: 'video' | 'image' | null; data: string | null }>>({})`
  2. We wszystkich miejscach gdzie jest `coverCache.get(key)` → `coverCache.value[key]`
  3. Gdzie jest `coverCache.set(key, val)` → `coverCache.value[key] = val; triggerRef(coverCache)`
  4. Gdzie jest `coverCache.delete(key)` → `delete coverCache.value[key]; triggerRef(coverCache)`

### A4. `encodeURI()` dla ścieżek audio
- **Plik:** `src/renderer/src/modules/audioEngine.ts`
- **Opis:** Ścieżki ze znakami `#`, `?`, spacjami powodują błędy przy odtwarzaniu. Owinąć ścieżkę w `encodeURI()` przed przekazaniem do `<audio>`.
- **Szacowany czas:** 15min
- **Kroki:**
  1. Znaleźć miejsce gdzie `audio.src` jest ustawiany (prawdopodobnie w `loadTrack` lub `play`)
  2. Dodać `audio.src = encodeURI(trackPath)` zamiast gołej ścieżki

### A5. Lazy loading Lucide ikon
- **Pliki:** Wszystkie `.vue` importujące z `@lucide/vue`
- **Opis:** Każdy import Lucide dodaje do bundle'a. Użyć `defineAsyncComponent` dla rzadko używanych ikon lub importować tylko potrzebne.
- **Szacowany czas:** 1h
- **Kroki:**
  1. Przejrzeć wszystkie importy Lucide w komponentach
  2. Dla rzadko używanych (np. w settings) użyć dynamicznego importu

---

## Faza B: Biblioteka — nowe funkcje (Priority: WYSOKI)

### B1. Album grid z cover art
- **Plik:** `src/renderer/src/views/LibraryView.vue`
- **Opis:** Zakładka Albumy obecnie pokazuje listę. Przebudować na siatkę okładek (podobnie do zdjęć w folderze) z nazwą albumu i artystą pod spodem. Wirtualizacja siatki (A2).
- **Szacowany czas:** 2h
- **Kroki:**
  1. Stworzyć komponent `AlbumCard.vue` (cover + nazwa + artysta)
  2. W `LibraryView.vue` — zakładka albumów → grid CSS (dynamic columns)
  3. Dodać `useVirtualizer` dla gridu
  4. Kliknięcie → odtwarza wszystkie utwory z albumu

### B2. Video grid z wirtualizacją
- **Plik:** `src/renderer/src/views/LibraryView.vue`
- **Opis:** Zakładka Video obecnie pokazuje listę `<LibraryTrackRow>`. Przebudować na grid kafelków z miniaturką (cover) + nazwą + czasem trwania.
- **Szacowany czas:** 2h
- **Kroki:**
  1. Stworzyć komponent `VideoCard.vue` (cover thumbnail + nazwa + duration)
  2. Grid CSS z wirtualizacją
  3. Kliknięcie → odtwarza video

### B3. Edycja tagów ID3
- **Pliki:** `src/main/ipc/handlers.ts`, nowy komponent UI
- **Opis:** `jsmediatags` jest w `package.json` ale nieużywany. Dodać IPC handler `media:writeTags` i UI do edycji metadanych (po prawej kliknięciu na track → "Edytuj tagi").
- **Szacowany czas:** 3h
- **Kroki:**
  1. IPC handler `media:writeTags` w `handlers.ts` — zapis ID3 przez `jsmediatags`
  2. Komponent `TrackTagEditor.vue` — modal z polami: tytuł, artysta, album, numer, rok
  3. Integracja z `LibraryTrackRow` — przycisk/kontekstowe menu "Edytuj tagi"

### B4. Automatyczne metadane (MusicBrainz)
- **Nowy plik:** `src/renderer/src/composables/useMusicBrainz.ts`
- **Opis:** Dla utworów bez metadanych — zapytanie do MusicBrainz API (open source, bez klucza). Fuzzy match po nazwie pliku + czasie trwania.
- **Szacowany czas:** 3h
- **Kroki:**
  1. Composable `useMusicBrainz` — `searchTrack(title, duration)` → `{ artist, album, title, year }`
  2. W `LibraryView`/`LibraryTrackRow` — przycisk "Pobierz metadane"
  3. Zapis przez `media:writeTags` (B3)

---

## Faza C: UI/UX (Priority: ŚREDNI)

### C1. Context menu dla tracków
- **Plik:** `src/renderer/src/components/library/LibraryTrackRow.vue`
- **Opis:** Prawe kliknięcie → menu z: "Odtwórz", "Dodaj do kolejki", "Dodaj do playlisty", "Edytuj tagi", "Pokaż w explorerze".
- **Szacowany czas:** 2h
- **Status:** ✅ Zrobione (również dla AlbumCard i VideoCard)

### C2. Drag & drop tracks do playlisty
- **Pliki:** `LibraryTrackRow.vue`, `LibraryPlaylistManager.vue`
- **Opis:** Przeciąganie utworów z listy do playlisty. Użyć `@vueuse/integrations` lub natywnego HTML5 drag & drop.
- **Szacowany czas:** 2h
- **Status:** ✅ Zrobione (Sidebar + LibraryPlaylistManager, visual highlight, deduplikacja)

### C3. Command Palette (Ctrl+K)
- **Plik:** Nowy komponent
- **Opis:** Wyszukiwanie utworów, nawigacja, akcje. Modal po Ctrl+K.
- **Szacowany czas:** 3h
- **Status:** ✅ Zrobione (CommandPalette.vue, lupa w TitleBar, usunięto SearchView)

### C4. Toast notification system
- **Plik:** Nowy store + komponent
- **Opis:** System powiadomień z historią. Użyć `vue-sonner` lub prostego store'a.
- **Szacowany czas:** 2h
- **Status:** ✅ Zrobione (ToastNotification.vue + konfiguracja pozycji/filtrów w settings)

---

## Faza D: Testy (Priority: ŚREDNI)

### D1. Testy dla player store
- **Plik:** Nowy plik testowy
- **Opis:** Kolejka, shuffle, repeat, clearQueue, addToQueue, setTrack
- **Szacowany czas:** 1h

### D2. Testy dla library store
- **Plik:** Nowy plik testowy
- **Opis:** loadFromDisk, scanFolders, addFolder, removeFolder, savePlaylists
- **Szacowany czas:** 1h

### D3. Testy dla formatters / fileTypes
- **Plik:** Uzupełnienie istniejących
- **Opis:** Dodanie brakujących case'ów, edge case'y
- **Szacowany czas:** 30min

---

## Faza E: Jakość kodu (Priority: NISKI)

### E1. i18n setup (vue-i18n)
- **Opis:** Przygotowanie infrastruktury — vue-i18n + locale pl/en. Zamiana stringów w komponentach.
- **Szacowany czas:** 3h (ale rozłożony — można robić incrementalnie)

### E2. IPC type safety
- **Opis:** Typowanie kanałów IPC — interfejs mapujący channel → args → result. Eliminacja `any` w `window.api.invoke`.
- **Szacowany czas:** 2h

### E3. puste `init()` w modułach — cleanup
- **Opis:** 6 z 8 modułów ma puste `init()`. Uprościć ModuleManager lub usunąć boilerplate.
- **Szacowany czas:** 30min

---

## Priorytetyzacja

```
TYDZIEŃ 1:  A1-A5 (Wydajność — quick wins) ✅
TYDZIEŃ 2:  B1-B2 (Album grid + Video grid) ✅
TYDZIEŃ 3:  B3-B4 (ID3 + MusicBrainz) ✅ (wcześniej)
TYDZIEŃ 4:  C1-C4 (UI/UX) ✅
TYDZIEŃ 5:  D1-D3 (Testy)
NISKI:      E1-E3 (kiedy czas)
```

Łączny czas: ~25-30h roboczych
