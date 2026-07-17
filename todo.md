# Onda - Plan Działania

## Przegląd Projektu

**Onda** - Full-featured odtwarzacz muzyki i video (lokalny + YouTube) zbudowany na Electron + Vue 3 + TypeScript + Tailwind CSS

---

## FAZA 0: Fundament i Architektura

> Priorytet: UI + Nawigacja jako pierwsza

### 0.1 Instalacja zależności

- [ ]`vue-router` - routing w aplikacji
- [ ]`pinia` - stan aplikacji (global store)
- [ ]`@vueuse/core` - utility composables
- [ ]`@lucide/vue` - ikony (zamiast lucide-vue-next)
- [ ]`electron-store` - zapis ustawień na dysku
- [ ]`@tanstack/vue-virtual` - wirtualne listy
- [ ]`pinia-plugin-persistedstate` - persistencja store

### 0.2 Struktura katalogów renderer

src/renderer/src/
├── main.ts ✅
├── App.vue ✅ (dynamic theme/accent/fontSize)
├── router/
│ └── index.ts ✅
├── stores/
│ ├── player.ts ✅
│ ├── library.ts ✅
│ ├── youtube.ts ✅
│ ├── settings.ts ✅
│ ├── explorer.ts ✅
│ └── ui.ts ✅
├── components/
│ ├── layout/
│ │ ├── TitleBar.vue ✅ (tabs + context menu)
│ │ ├── Sidebar.vue ✅ (resize + collapse)
│ │ ├── TopMenu.vue ✅
│ │ ├── PlayerBar.vue ✅ (eq + queue buttons)
│ │ └── StatusBar.vue ✅ (file count per view)
│ ├── player/
│ │ ├── AudioVisualizer.vue ✅ (bars/wave/radial)
│ │ ├── Equalizer.vue ✅ (10-band + presets, fixed sliders)
│ │ └── QueuePanel.vue ✅ (queue + history)
│ ├── explorer/ ❌ (faza 5)
│ ├── youtube/ ❌ (faza 3)
│ ├── library/ ❌ (faza 4)
│ ├── settings/ ❌ (faza 6)
│ ├── common/ ❌ (faza 7)
│ └── titlebar/ ❌ (faza 7)
├── views/
│ ├── HomeView.vue ✅
│ ├── PlayerView.vue ✅ (fullscreen + controls overlay)
│ ├── ExplorerView.vue ✅ (drives + grid/list)
│ ├── YouTubeView.vue ✅
│ ├── LibraryView.vue ✅
│ ├── DownloadsView.vue ✅
│ ├── SearchView.vue ✅
│ └── SettingsView.vue ✅
├── composables/
│ └── useMediaPlayer.ts ✅ (audio engine + Web Audio API)
├── utils/
│ ├── fileTypes.ts ✅
│ ├── formatters.ts ✅
│ ├── youtube.ts ❌
│ ├── metadata.ts ❌
│ └── constants.ts ✅ (THEME_PALETTES added)
├── types/
│ ├── media.ts ✅
│ ├── settings.ts ✅
│ ├── youtube.ts ✅
│ └── explorer.ts ✅
└── assets/
├── main.css ✅ (Tailwind @theme)
└── themes/ ❌ (palettes w constants.ts)

### 0.3 Preload - rozszerzenie API

- [ ]`src/preload/index.ts` - dodanie IPC invoke/on do:
- [ ]System: odczyt/zapis plików, dialogi (open/save/folder)
- [ ]Media: odczyt metadanych, miniaturki (stub - returning basic info)
- [ ]YouTube: pobieranie, info o filmach (stub - awaiting yt-dlp)
- [ ]Ustawienia: zapis/odczyt konfiguracji
- [ ]Aktualizacje: sprawdzanie nowych wersji (stub - awaiting electron-updater)
- [ ]Tray: ikona w zasobniku systemowym (z menu play/pause/next/prev/show/quit)
- [ ]Window: sterowanie oknem (min/max/close/always-on-top)
- [ ]Global shortcuts: rejestracja skrótów globalnych (MediaPlayPause, MediaNextTrack, etc.)

### 0.4 Main process - rejestracja handlerów IPC

- [ ]`src/main/index.ts` - handlery IPC:
- [ ]`fs:readFile`, `fs:writeFile`, `fs:readdir`, `fs:stat`
- [ ]`dialog:openFile`, `dialog:saveFile`, `dialog:openFolder`
- [ ]`media:getMetadata`, `media:getThumbnail` (stub)
- [ ]`yt:search`, `yt:getInfo`, `yt:download`, `yt:getChannel` (stub)
- [ ]`settings:get`, `settings:set`
- [ ]`update:check`, `update:download`, `update:install` (stub)
- [ ]`window:minimize`, `window:maximize`, `window:close`, `window:alwaysOnTop`
- [ ]`window:createChild`, `window:closeChild` (PiP/mini player windows)
- [ ]`app:quit`, `app:getPath`
- [ ]`shell:openExternal`, `shell:showItemInFolder`

### 0.5 Router

- [ ]Trasy: `/`, `/player`, `/explorer`, `/youtube`, `/library`, `/downloads`, `/search`, `/settings`
- [ ]Obsługa okien podrzędnych (dla PiP, mini player)

---

## FAZA 1: UI Skeleton + Nawigacja

### 1.1 Własny Title Bar

- [ ]`TitleBar.vue` - customowy pasek tytułu zamiast natywnego
- [ ]Ikona aplikacji + nazwa
- [ ]Zakładki (tabs) jak w przeglądarce
- [ ]Pasek wyszukiwania centralnie
- [ ]Przyciski okna: minimize, maximize, close
- [ ]Drag region do przesuwania okna
- [ ]Kontekstowe menu na zakładkach (zamknij, zamknij inne, zamknij wszystkie)

### 1.2 Top Menu Bar

- [ ]`TopMenu.vue` - pasek menu pod titlebarem
- [ ]Ikony rozwijane: Plik, Widok, Odtwarzacz, Pomoc
- [ ]Odpowiednio do widoku (w eksploratorze inne opcje niż w odtwarzaczu)
- [ ]Pasek adresu w eksploratorze (breadcrumb z klikalnymi segmentami)

### 1.3 Sidebar

- [ ]`Sidebar.vue` - panel boczny (rozwijalny/chowany)
- [ ]Nawigacja: Strona główna, Biblioteka, Eksplorator, YouTube, Pobrane
- [ ]Playlista / Kolejka na dole
- [ ]Playlisty użytkownika (drzewo) — rozwijane z przyciskiem Nowa Playlista
- [ ]Przeciąganie i upuszczanie (drag & drop) — reorder w kolejce + pliki z systemu
- [ ]Resize - przeciąganie krawędzi do zmiany szerokości
- [ ]Minimalizowany tryb (tylko ikony)

### 1.4 Player Bar (dół)

- [ ]`PlayerBar.vue` - stały pasek odtwarzacza na dole
- [ ]Lewa część: miniaturka + tytuł + artysta + serce (ulubione)
- [ ]Środek: controls (prev, play/pause, next, shuffle, repeat) + progress bar + czas
- [ ]Prawa część: equalizer ikona + kolejka ikona + głośność + fullscreen
- [ ]Mini player mode (przełącznik min/max w player barze)
- [ ]Pasek postępu na górze player bar (hover = enlarged)

### 1.5 Status Bar

- [ ]`StatusBar.vue` - dolny pasek statusu
- [ ]Info o aktualnym pliku / formacie / bitrate
- [ ]Liczba plików w widoku
- [ ]Status pobierania (jeśli aktywne)

### 1.6 Motywy i Wygląd

- [ ]System motywów CSS (dark, light, midnight, spotify-like, custom)
- [ ]Przełączanie motywów w czasie rzeczywistym (dynamiczne applyTheme w App.vue)
- [ ]Zmiana koloru akcentu
- [ ]CSS variables dla całego theme'u (poprzez @theme Tailwind CSS)
- [ ]Zapis preferencji w ustawieniach

### 1.7 Router + Widoki

- [ ]Strona główna: ostatnio odtwarzane, rekomendacje, szybki dostęp
- [ ]Transitions między widokami (fade)
- [ ]Lazy loading widoków (dynamic import w routerze)

---

## FAZA 2: Odtwarzacz Multimediów (Lokalny)

### 2.1 Silnik odtwarzania

- [ ]`useMediaPlayer.ts` composable:
- [ ]Natywny HTML5 `<video>` / `<audio>` (prostota + Electron)
- [ ]Detekcja formatu i wybór elementu audio/video
- [ ]Obsługa: play, pause, stop, seek, skip
- [ ]Playlist management (kolejka, repeat, shuffle)
- [ ]Obsługa formatów: MP3, FLAC, WAV, OGG, AAC, MP4, MKV, AVI, WebM
- [ ] Gapless playback (bez przerw między utworami)
- [ ] Crossfade (przejścia między utworami z konfigurowalnym czasem)
- [ ]Playback rate (szybkość odtwarzania)
- [ ] Remember position (wznawianie od miejsca zatrzymania)

### 2.2 Video Player

- [ ]`VideoPlayer.vue` (PlayerView.vue):
- [ ]Fullscreen (natywny fullscreen przez playerContainerRef z controls)
- [ ]Picture-in-Picture (osobne okno data:text/html zawsze na wierzchu):
  - [ ]Okno PiP w main process (BrowserWindow, frame:false, alwaysOnTop)
  - [ ]PiP HTML z video + przycisk zamknij + progress bar + czas
  - [ ]Ustawienia PiP: pozycja (4 rogi), rozmiar (szer/wys)
  - [ ]Synchronizacja ścieżki: zmiana utworu w main → PiP aktualizuje src
  - [ ]Zamknięcie PiP → wznawianie w main od zapisanego czasu
  - [ ]Polling co 500ms czytający currentTime z PiP (niezawodny zamiast executeJS na close)
  - [ ]pipResumeTime w store — odporny na clobbering przez timeupdate
  - [ ]Flag pipClosing — zapobiega fałszywemu pip:closed przy przełączaniu PiP
- [ ] Napisy (.srt, .vtt) oraz wgrane w video - ładowanie i wyświetlanie
- [ ] OSD overlay (On-Screen Display) - info o odtwarzaniu
- [ ]double-click = fullscreen, single-click = play/pause
- [ ] Sterowanie gestami myszy (scroll = głośność, click = pauza)
- [ ]Odtwarzanie w pętli (repeat none/all/one w store + UI w PlayerBar + PlayerView)
- [ ]Kontrolki video w PlayerView: shuffle, repeat, equalizer, queue toggles

### 2.3 Audio Player

- [ ]`AudioVisualizer.vue`:
- [ ]Spectrum bars
- [ ]Waveform
- [ ]Circle/radial visualization
- [ ]Canvas-based rendering (Web Audio API + AnalyserNode)
- [ ]Animacje z 60fps (requestAnimationFrame)
- [ ] Wczytanie informacji z pliku audio (ID3 tags) i wyświetlenie tytułu, artysty, albumu, okładki w wizualizacji
- [ ] Obsługa wielu presetów wizualizacji (bars, waveform, radial, etc.)
- [ ] Możliwość tworzenia własnych presetów wizualizacji (custom shaders, colors, etc.)
- [ ] Synchronizacja wizualizacji z muzyką (beat detection, frequency analysis)
- [ ] Po zmilizowaniu aplikacji przy otwarzaniu audio ma pojawić się wizualizacja
- [ ] Jeśli w folderze jest plik wideo o takiej samej nazwie co plik audio, to odtwarzacz powinien automatycznie uzyć go jako wideo album art (np. plik.mp3 + plik.mp4 w tym samym folderze = odtwarzanie pliku.mp4 jako wizualizacja)
- [ ] Jesli odpalasz audio to ma nie kozystać z wideo playera tylko z audio playera( czyli nie ma wideo playera w tle tylko audio player z wizualizacją zalezności czy istnie plik o tej samej nazwie co plik audio i jest wideo to odtwarzacz ma użyć go jako wizualizację)

### 2.4 Equalizer

- [ ]`Equalizer.vue`:
- [ ]10-pasmowy equalizer (BiquadFilterNode chain)
- [ ]Presety: Pop, Rock, Jazz, Classical, Bass Boost, Treble Boost, Vocal
- [ ] Custom presets (zapis/odczyt)
- [ ] Wizualizacja pasm w czasie rzeczywistym (frequency response curve)
- [ ]Suwak gain per pasmo (-12 do +12 dB, custom div sliders)

### 2.5 Kolejka odtwarzania

- [ ]`QueuePanel.vue`:
- [ ]Lista kolejki z drag & drop (reorder + pliki z systemu)
- [ ]Historia odtwarzania (ostatnie 10 utworów)
- [ ] Dodawanie z biblioteki (brak przycisku "Add to Queue" per track)
- [ ] Dodawanie z eksploratora (brak context menu / przycisku)
- [ ] Dodawanie z YouTube (brak przycisku "Add to Queue")
- [ ]Usuwanie z kolejki (per item + wyczyść wszystko)
- [ ] Zapis kolejki do pliku (M3U)

### 2.6 Media Session API

- [ ]Integracja z systemową sesją mediów:
- [ ]Przyciski na klawiaturze (MediaPlayPause, MediaNextTrack, MediaPreviousTrack, MediaStop)
- [ ] Powiadomienia systemowe (Windows Media Overlay)
- [ ]Tray icon menu (Play/Pause, Next, Prev, Show, Quit)

---

## FAZA 3: YouTube Integration

### 3.1 Silnik pobierania - Rekomendacja: yt-dlp

- [ ] **yt-dlp** (CLI) jako główne narzędzie:
- [ ] Pobieranie muzyki (konwersja na MP3/FLAC/OGG)
- [ ] Pobieranie video (najwyższa jakość, wybór formatu)
- [ ] Pobieranie playlist
- [ ] Pobieranie napisów
- [ ] Pobieranie miniaturek
- [ ] Obsługa proxy
- [ ] Wielowątkowe pobieranie
- [ ] Wznawianie przerwanych pobierania
- [ ] Wrapper w `src/main/yt-dlp.ts`

### 3.2 Wyszukiwanie

- [ ] `YouTubeSearch.vue`:
- [ ] Pasek wyszukiwania z autouzupełnianiem
- [ ] Filtry: typ (video/kanał/playlista), data, durée, jakość
- [ ] Lista wyników z miniaturkami
- [ ] Infinitescroll (wirtualna lista)
- [ ] Quick preview (hover = mini odtwarzacz)

### 3.3 Widok kanału

- [ ] `ChannelView.vue`:
- [ ] Info o kanale (nazwa, subskrybenci, avatar, opis)
- [ ] Sekcje: Filmy, Playlisty, O kanale
- [ ] Przycisk subskrypcji (zarządzanie)
- [ ] Filtry sortowania

### 3.4 Subskrypcje kanałów

- [ ] `SubscriptionManager.vue`:
- [ ] Lista subskrybowanych kanałów
- [ ] Automatyczne sprawdzanie nowych filmów (co X minut)
- [ ] Powiadomienia o nowych filmach
- [ ] Auto-pobieranie brakujących filmów (opcjonalne)
- [ ] Filtry: pobrane / niepobrane

### 3.5 Pobieranie

- [ ] `DownloadDialog.vue`:
  - [ ] Wybór formatu audio (MP3, FLAC, AAC, OGG)
  - [ ] Wybór jakości video (1080p, 720p, 480p, etc.)
  - [ ] Wybór ścieżki zapisu
  - [ ] Nazwa pliku (custom template z metadanymi)
  - [ ] Progress bar z prędkością i ETA
  - [ ] Lista pobierania (aktywne / ukończone / błędy)
  - [ ] Anulowanie / wznawianie

### 3.6 Okładki z YouTube

- [ ] Pobieranie miniaturki filmu jako okładki albumu
- [ ] Wybór momentu z filmu jako okładka (seek + screenshot)
- [ ] Wgranie własnego fragmentu video jako okładka
- [ ] Kadrowanie i przycinanie okładki

---

## FAZA 4: Biblioteka Mediów

### 4.1 Skanowanie i indeksowanie

- [ ] `useLibrary.ts` composable:
  - [ ] Skanowanie folderów w poszukiwaniu mediów
  - [ ] Odczyt metadanych ID3/FLAC/MP4 (tagi: tytuł, artysta, album, rok, gatunek, okładka)
  - [ ] Budowanie bazy danych biblioteki (JSON/SQLite)
  - [ ] Aktualizacja biblioteki (watch mode)
  - [ ] Obsługa large libraries (wirtualna lista)

### 4.2 Widoki biblioteki

- [ ] `LibraryView.vue`:
  - [ ] Przeglądanie wg: Artysty, Albumu, Gatunku, Roku, Folderu
  - [ ] Sortowanie: A-Z, Data dodania, Czas trwania, Popularność
  - [ ] Widok siatki (okładki) / Widok listy (tabela)
  - [ ] Filtry wielokrotne

### 4.3 Album i Artysta

- [ ] Widok albumu z tracklistą i okładką
- [ ] Widok artysty z dyskografią
- [ ] Automatyczne pobieranie metadanych z MusicBrainz/Discogs

### 4.4 Tagi ID3

- [ ] Odczyt metadanych z plików audio
- [ ] Zapis metadanych (edycja tagów)
  - Tytuł, Artysta, Album, Rok, Gatunek, Track #
  - Okładka (wklejanie z URL / wycinanie z video / własny plik)

---

## FAZA 5: Eksplorator Plików (Windows 11 Style)

### 5.1 Drzewo katalogów

- [ ] `TreeView.vue`:
  - [ ] Drzewo folderów (lew panel)
  - [ ] Rozwijanie/zwijanie
  - [ ] Ikony typów (folder, muzyka, video, obraz)
  - [ ] Drag & drop (przenoszenie plików)
  - [ ] Skrót do ulubionych / szybki dostęp

### 5.2 Pasek adresu

- [ ] `AddressBar.vue`:
  - [ ] Ścieżka z breadcrumb (klikalne segmenty)
  - [ ] Edycja ścieżki (text input)
  - [ ] Przycisk w górę / do tyłu / do przodu
  - [ ] Historia nawigacji (back/forward)
  - [ ] Szybki dostęp (Downloads, Documents, Desktop, Music, Videos)

### 5.3 Widok siatki i listy

- [ ] `FileGrid.vue`:
  - [ ] Miniaturki plików (auto-generated z video/audio)
  - [ ] Nazwa pod miniaturką
  - [ ] Zaznaczanie (click, ctrl+click, shift+click)
  - [ ] Wiele zaznaczenia (marquee selection)

- [ ] `FileList.vue`:
  - [ ] Tabela z kolumnami: Nazwa, Rozmiar, Typ, Data modyfikacji, Długość
  - [ ] Sortowanie po kolumnach
  - [ ] Zaznaczanie wielu wierszy

### 5.4 Menu kontekstowe eksploratora

- [ ] Otwórz / Odtwórz
- [ ] Otwórz z... (wybór programu)
- [ ] Odtwórz w odtwarzaczu
- [ ] Dodaj do kolejki
- [ ] Dodaj do playlisty
- [ ] Pobierz miniaturkę
- [ ] Pokaż w eksploratorze Windows
- [ ] Kopiuj / Wklej / Wytnij
- [ ] Zmień nazwę
- [ ] Właściwości
- [ ] Usuń

### 5.5 Drag & Drop

- [ ] Przeciąganie plików z eksploratora do odtwarzacza
- [ ] Przeciąganie plików do kolejki
- [ ] Przeciąganie plików do playlisty
- [ ] Native file drop (z systemu)

---

## FAZA 6: Ustawienia (Pełne)

### 6.1 `SettingsView.vue` - Layout z sidebar + panels

- [ ]Sidebar z kategoriami ustawień z ikonami (Wygląd, Odtwarzanie, Pobieranie, Skróty, Sieć, Klucze API, Aktualizacje)
- [ ]Sekcja Picture-in-Picture w zakładce Odtwarzanie (przyciski pozycji + suwaki rozmiaru)

### 6.2 Wygląd / Theme

- [ ] Motyw: Ciemny / Jasny / Midnight / Spotify / Niestandardowy
- [ ] Kolor akcentu (color picker)
- [ ] Rozmiar czcionki
- [ ] Kompaktowy / Comfortable / Spacious tryb
- [ ] Animacje: włączone/wyłączone
- [ ] Transparencja okna (opacity)
- [ ] Tło okna (custom background)

### 6.3 Odtwarzanie

- [ ] Domyślny odtwarzacz: HTML5 / VLC (jeśli dostępny)
- [ ] Crossfade: czas (0-10s)
- [ ] Normalizacja głośności
- [ ] Replay Gain
- [ ] Gapless playback: włączone/wyłączone
- [ ] Auto-pauza gdy inne okno aktywne
- [ ] Domyślna głośność startowa
- [ ] Zapamiętywanie pozycji odtwarzania
- [ ]Picture-in-Picture: pozycja (bottom-right, bottom-left, top-right, top-left)
- [ ]Picture-in-Picture: rozmiar okna (szerokość/wysokość w px)

### 6.4 Pobieranie

- [ ] Domyślna ścieżka zapisu
- [ ] Domyślny format audio (MP3/FLAC/OGG)
- [ ] Domyślna jakość video
- [ ] Nazwa pliku template: `{title} - {artist}` etc.
- [ ] Limit równoległych pobrań
- [ ] Auto-pobieranie ze subskrypcji
- [ ] Hashing plików (unika duplikatów)

### 6.5 Skróty klawiszowe

- [ ] Lista wszystkich akcji z przypisanymi skrotami
- [ ] Edycja skrótów (click + key combo)
- [ ] Eksport/import ustawień skrótów
- [ ] Reset do domyślnych
- [ ] Globalne skróty (dzialają gdy okno nieaktywne):
  - Play/Pause, Next, Previous, Volume Up/Down, Mute

### 6.6 Sieć / Proxy

- [ ] Proxy: HTTP/HTTPS/SOCKS
  - Adres, port, auth (login/hasło)
- [ ] Test połączenia proxy
- [ ] Limit prędkości pobierania
- [ ] DNS cache
- [ ] User-Agent

### 6.7 Klucze API

- [ ] YouTube Data API v3:
  - [ ] Input klucza API
  - [ ] Walidacja klucza (testowe zapytanie)
  - [ ] Przypisanie wartości:
    - `maxResults` (1-50, default 25)
    - `order` (date, rating, relevance, title, viewCount)
    - `videoDuration` (short, medium, long, any)
    - `regionCode` (PL, US, etc.)
    - `type` (video, channel, playlist)
    - `fields` - które pola JSON zwracać (snippet, contentDetails, statistics, etc.)
  - [ ] Zapis klucza w bezpieczny sposob (electron-store encrypted)
  - [ ] Lista dostępnych kluczy z przypisanymi rolami

- [ ] Inne potencjalne API:
  - [ ] MusicBrainz API (metadane muzyki, darmowe)
  - [ ] Discogs API (informacje o albumach)
  - [ ] Last.fm API (scrobbling, rekomendacje)
  - [ ] OMDb API (filmy)

### 6.8 Aktualizacje

- [ ] Auto-sprawdzanie nowych wersji
- [ ] Harmonogram sprawdzania (co start / co X godzin / ręcznie)
- [ ] Informacja o nowej wersji + changelog
- [ ] Pobieranie i instalacja w tle
- [ ] Przypomnienie o restarcie

---

## FAZA 7: Zaawansowane Funkcje

### 7.1 Wielo-okienność

- [ ]Osobne okno odtwarzacza (picture-in-picture — implemented w Faza 2.2)
- [ ] Osobne okno eksploratora
- [ ] Synchronizacja stanu między oknami (IPC)
- [ ] Zamknięcie głównego okna = minimize do tray

### 7.2 Menu kontekstowe globalne

- [ ] Dostosowane do elementu (plik, folder, odtwarzacz, etc.)
- [ ] Szybkie akcje (odtwórz, dodaj do kolejki, pobierz)
- [ ] Podmenu: Otwórz w..., Odtwórz w...

### 7.3 Tray Icon

- [ ] Ikona w zasobniku systemowym
- [ ] Menu tray: Play/Pause, Next, Prev, Quit
- [ ] Tooltip z aktualnym utworem
- [ ] Powiadomienia (toast) o zmianie utworu

### 7.4 Wyszukiwanie globalne

- [ ] Ctrl+K / Cmd+K: Command palette
- [ ] Wyszukiwanie w bibliotece, YouTube, ustawieniach
- [ ] Filtry kontekstowe
- [ ] Szybkie rezultaty z miniaturkami

### 7.5 Lista wirtualna

- [ ] `VirtualList.vue` komponent dla dużych list
- [ ] Infinitescroll (lazy loading)
- [ ] RecyclePool (ponowne użycie elementów DOM)
- [ ] Obsługa 100k+ elementów bez lagów

### 7.6 System wtyczek (architektura)

- [ ] Plugin manifest format
- [ ] Plugin loader (dynamiczne importowanie)
- [ ] Plugin API (dostęp do player, library, UI hooks)
- [ ] Plugin store (persistentne dane wtyczek)

---

## FAZA 8: Integracja z Systemem

### 8.1 Auto-Update

- [ ] `electron-updater` - automatyczne sprawdzanie
- [ ] Progress pobierania aktualizacji
- [ ] Restart po instalacji

### 8.2 Tray Icon

- [ ] Dynamiczna ikona w tray (based on playing state)
- [ ] Context menu tray

### 8.3 Globalne Skróty

- [ ] Media keys (play/pause/next/prev)
- [ ] Custom global shortcuts (np. Ctrl+Alt+M = mute)

### 8.4 File Associations

- [ ] Rejestracja typów plików: .mp3, .flac, .mp4, .mkv, .m3u, etc.
- [ ] Otwieranie plików przez double-click w systemie

### 8.5 Protocol Handler

- [ ] `onda://` protocol do deep linking

---

## FAZA 9: Optymalizacja i Wydanie

### 9.1 Wydajność

- [ ] Virtual scrolling dla dużych bibliotek
- [ ] Lazy loading obrazków
- [ ] Worker threads dla ciężkich operacji (skanowanie, konwersja)
- [ ] Cache miniaturek na dysku

### 9.2 Pakowanie

- [ ] electron-builder: NSIS installer (Windows)
- [ ] Code signing
- [ ] Auto-update publisher (GitHub Releases)

### 9.3 Testy

- [ ] Unit testy (Vitest)
- [ ] E2E testy (Playwright)
- [ ] Testy integracyjne IPC

---

## Rekomendowane Biblioteki

| Cel          | Biblioteka                 | Uzasadnienie                             |
| ------------ | -------------------------- | ---------------------------------------- |
| Routing      | `vue-router`               | Standard Vue                             |
| Stan         | `pinia`                    | Standard Vue 3                           |
| Ikony        | `lucide-vue-next`          | Lekkie, SVG-based                        |
| YouTube      | `yt-dlp` (CLI)             | Najbardziej stabilne, aktywnie rozwijane |
| Metadata     | `music-metadata` (Node.js) | Odczyt ID3, FLAC, MP4 tags               |
| Ustawienia   | `electron-store`           | Prosty key-value store w Electron        |
| Equalizer    | Web Audio API (native)     | Bez zależności, natywne API              |
| Wizualizacja | Canvas API (native)        | Bez zależności                           |
| Napisy       | `srt-parser-2` lub native  | Parsowanie .srt/.vtt                     |
| Virtual list | `@tanstack/vue-virtual`    | Wydajne renderowanie dużych list         |
| Auto-update  | `electron-updater`         | Już zainstalowany                        |

---

## Kolejność Implementacji

FAZA 0 (fundament) → FAZA 1 (UI skeleton)
↓
FAZA 2 (odtwarzacz) ← priorytet nr 1
↓
FAZA 5 (eksplorator) ← priorytet nr 2
↓
FAZA 3 (YouTube) ← priorytet nr 3
↓
FAZA 4 (biblioteka)
↓
FAZA 6 (ustawienia)
↓
FAZA 7-9 (zaawansowane + release)

---
