# Changelog

Wszystkie istotne zmiany w projekcie Onda są dokumentowane w tym pliku.

## [0.4.2](https://github.com/gb-redRabit/Onda/compare/v0.4.2...v0.4.2) (2026-09-12)


### Features

* **architecture:** Phase 3 - EventBus, audioEngine class, router await, strict TS, shared constants ([49b1e39](https://github.com/gb-redRabit/Onda/commit/49b1e39a4025a62444fc7ff4dc209d4af8a51944))
* audio PiP — max top position, transparent bg, mode toggle, EQ, next track, UI polish ([fc59729](https://github.com/gb-redRabit/Onda/commit/fc59729ba3f63bbc65a5379b5d4000da7260a1c3))
* audio PiP — wide mode, canvas viz 60fps 192 bars, coverType (image/video), shuffle/repeat state ([3fdc567](https://github.com/gb-redRabit/Onda/commit/3fdc567accc1d542f59f81fed49e6ac6c048025e))
* audio PiP fixes + crossfade removal + cleanup ([0d6ed85](https://github.com/gb-redRabit/Onda/commit/0d6ed852b0ad7d70be0d8dd42a83ebd2d9a694b0))
* **audio:** rebuild audio view with free canvas layout engine ([257efa3](https://github.com/gb-redRabit/Onda/commit/257efa3a0f043c30c2b7143b381443ad5213578c))
* **explorer:** complete overhaul + ImageViewer lightbox ([30df860](https://github.com/gb-redRabit/Onda/commit/30df8609c8b018df1a6ab4704c113562903b1a20))
* Phase 3b — Audio PiP medium/max modes + settings UI ([e130702](https://github.com/gb-redRabit/Onda/commit/e130702be96782b26a8075297da3ab54955577ae))
* **release:** instalatory NSIS/dmg/AppImage + auto-release release-please ([315034e](https://github.com/gb-redRabit/Onda/commit/315034ee41226e87c0bb34f0774a5b3b82fa37ca))
* **sources:** download + player + icons + export/import ([391a85d](https://github.com/gb-redRabit/Onda/commit/391a85dfcf2c934c9ceb71ba52ee9a36e69dea95))
* **themes:** motywy konfigurowalne — 29 zmiennych, 10 motywów wbudowanych, szkło acrylic ([5a50e5d](https://github.com/gb-redRabit/Onda/commit/5a50e5d2afd8b7b35ef3897700dbc7840b7c6f30))
* **ui:** glass radius lock, image viewer window, fx polish ([86d7ba5](https://github.com/gb-redRabit/Onda/commit/86d7ba59331a06b619de77a52cddf13fe1bc2044))
* **ui:** splash renderer-ready + acrylic lifecycle ([68f2843](https://github.com/gb-redRabit/Onda/commit/68f2843a48308e04dd9f81224ed5d2e7e81bf089))
* unified AppMenu — merged TitleBar + TopMenu with view-specific sections ([d46f725](https://github.com/gb-redRabit/Onda/commit/d46f7253be288a8b70a73b37e9e325f92f60bfd9))
* unified AppMenu, delete old TitleBar/TopMenu, fix video covers ([d34266e](https://github.com/gb-redRabit/Onda/commit/d34266ed0c05ae455a71a9f8eaf6e8aed3f3e25b))
* video PiP — maximize button, settings overlay (subs/brightness/contrast), pre-buffer toggle ([6efb0bc](https://github.com/gb-redRabit/Onda/commit/6efb0bc187360beef70c15832b496bf4ed977151))
* video PiP converted to Vue — theme & accent reactivity, pip:theme IPC ([5748b21](https://github.com/gb-redRabit/Onda/commit/5748b21bca7abe77b363d520d479e9431bb80fca))


### Bug Fixes

* AppMenu dropdown closes on mouse move to items ([b4783b6](https://github.com/gb-redRabit/Onda/commit/b4783b65b1a19e257fc3e64199cf244ad5925dd7))
* brak await na getMkvExtractPath() - czcionki z MKV nie były wyciągane ([978ebb7](https://github.com/gb-redRabit/Onda/commit/978ebb73835b3177971791e835fbd949c5cd6b80))
* **build:** ship splash.html in package, exclude dev dirs from app.asar ([8e4d130](https://github.com/gb-redRabit/Onda/commit/8e4d130e8bc3e2b0c714717193a969f5bf85c40d))
* **build:** unpack sharp native libs, publish installers only ([ac60ea0](https://github.com/gb-redRabit/Onda/commit/ac60ea0e7e6b2c4182c86a08b22f12237f2eb8aa))
* capture video frame via HTML5 canvas as fallback ([8856bf2](https://github.com/gb-redRabit/Onda/commit/8856bf2af13ed35be78db81c82956cff5a65e29f))
* **ci:** bound linux smoke test, assert window-created milestone ([529efd6](https://github.com/gb-redRabit/Onda/commit/529efd6e31a23dd2161f3e65c072ba7b3b7c1a63))
* **ci:** linux ffmpeg source, mac universal sharp, node24 actions, renderer lint ([59b71fc](https://github.com/gb-redRabit/Onda/commit/59b71fca45869b53b3eb75fe816065247c3b7db5))
* **ci:** mac universal native files, deterministic GitHub release ([78554d0](https://github.com/gb-redRabit/Onda/commit/78554d0cb877f3de0288e67f91a43bf8149c2268))
* **ci:** run ensure-release step under bash (fixes pwsh parser error on windows) ([30f4955](https://github.com/gb-redRabit/Onda/commit/30f4955efc4313b665fa97ad6a6fac2d00ba5734))
* **ci:** run linux smoke test headless (xvfb + no-sandbox) ([2865fdc](https://github.com/gb-redRabit/Onda/commit/2865fdc06af2824b307654efbdcecc67d499d970))
* cover change not reflected in library ([7a43f89](https://github.com/gb-redRabit/Onda/commit/7a43f899581fe0fc80032bcaec33a4e335291e2b))
* create + resume AudioContext within user gesture for video ([6014c59](https://github.com/gb-redRabit/Onda/commit/6014c593394a476abe8e47641d405c75f76e4cb2))
* createMediaElementSource before setting video src ([4d24f53](https://github.com/gb-redRabit/Onda/commit/4d24f53faf6f5657cf0c25d2cd82010e4874b872))
* crossfade silence, EQ bypass, preload cleanup, videoSourceNode, destroy ([64cb6e5](https://github.com/gb-redRabit/Onda/commit/64cb6e583c837ec35f7c8113d637c2f58a8f4e98))
* drop createMediaElementSource for videos - play audio natively ([da86a33](https://github.com/gb-redRabit/Onda/commit/da86a33ce33db30cbe4a3fe0685801b1c4d5908d))
* electron-store ESM import - lazy init z dynamic importem ([7f0f333](https://github.com/gb-redRabit/Onda/commit/7f0f333267f25ace3a06912db614e4bfe945dd82))
* ensure IPC-safe state values in useAudioPiP (coerce primitives, slice arrays) ([9e022e2](https://github.com/gb-redRabit/Onda/commit/9e022e22b45f1d0dfc892233b596f66d16085ac7))
* ErrorBoundary brak single root element - warning Transition ([12229f3](https://github.com/gb-redRabit/Onda/commit/12229f38c35c9d33bbf1f7b4b1b54447ea852fe8))
* folder type ratio - require &gt;= 70% dominance for pure type ([5c1219a](https://github.com/gb-redRabit/Onda/commit/5c1219a1e1fe0d49a4536ccdbe7972c66b7945cc))
* height chain - main flex-col + ErrorBoundary flex-1 zamiast h-full ([af2977d](https://github.com/gb-redRabit/Onda/commit/af2977d54f6f71e9b8076d0a32eaf6b1beffef12))
* mute toggle + ui redesign ([8a1f2b2](https://github.com/gb-redRabit/Onda/commit/8a1f2b229e06053bfd0cf01fb803e44a0699d6c9))
* PiP — timeUpdate propagates all fields, buttons work in minimal, cover/EQ fix ([b7d82c4](https://github.com/gb-redRabit/Onda/commit/b7d82c40c0b7c8df5c37f37fc9850fa9e7602e45))
* player shortcuts, playback optimizations and audio visuals ([8823e15](https://github.com/gb-redRabit/Onda/commit/8823e15590956eb7fca9743335cfb7833bcfdd98))
* pre-extract and cache video frame during scan ([4c4d199](https://github.com/gb-redRabit/Onda/commit/4c4d1990d5ccd40f3756e50b60c99f36d162e56a))
* **release:** remove invalid package-name input for v4 ([867f866](https://github.com/gb-redRabit/Onda/commit/867f8662f0e30b1da79fd734e96eb2163cc61f52))
* replace requestIdleCallback with immediate cover loading ([ad38b55](https://github.com/gb-redRabit/Onda/commit/ad38b55279999182d5267ac11ebc4de03a805d5b))
* resume AudioContext when connecting video element ([e313385](https://github.com/gb-redRabit/Onda/commit/e31338534e0d00c51dd459eae8b6db66cc4f5299))
* **stability:** Faza 1 - poprawki stabilności (8 zmian) ([74f5e7b](https://github.com/gb-redRabit/Onda/commit/74f5e7bd8c112ad86e07d8a0633b39f9e96c9488))
* **test:** platform-aware path handling for IPC guards and media server ([ee51887](https://github.com/gb-redRabit/Onda/commit/ee51887743db9fdff358dff7751fdf8d0b2b3812))
* **test:** use a writable platform-aware parent for extra-root tests ([ec6b370](https://github.com/gb-redRabit/Onda/commit/ec6b3706f0f84ced76be42fd3a9835a43f713438))
* three-tier video cover loading (IPC, canvas, video element) ([e69389b](https://github.com/gb-redRabit/Onda/commit/e69389b8a235c8951c4cf1aceeffb4a01082a27d))
* transcode unsupported audio codecs (AC3/DTS) for video playback ([b492302](https://github.com/gb-redRabit/Onda/commit/b492302aa62e9897bd189c9dc4e6a8b7291049a6))
* video covers, library refresh and status bar polish ([c592a35](https://github.com/gb-redRabit/Onda/commit/c592a352902bf6c4baa19a1ab980d3d5f6326359))
* VideoCard renders first frame via &lt;video&gt; element immediately ([3be5402](https://github.com/gb-redRabit/Onda/commit/3be5402b95c6d984fe4c0bb2010bfcd35cf2ce8a))
* volume distortion, video covers, scan ratio ([a765b32](https://github.com/gb-redRabit/Onda/commit/a765b3212b24d81bce991068e63a4f69f6afeaa0))


### Performance Improvements

* fast chunk-first transcoding for unsupported audio codecs ([212bc76](https://github.com/gb-redRabit/Onda/commit/212bc76e2e14bd19e72a6c9214bdc208692ceaf5))
* **performance:** Faza 2 - poprawki wydajności (7 zmian) ([65ff115](https://github.com/gb-redRabit/Onda/commit/65ff115c83b8e4d3d7994e5e310f6c43a6878b99))


### Miscellaneous Chores

* release 0.4.2 ([27aa754](https://github.com/gb-redRabit/Onda/commit/27aa7549383d540836a538349061c72d9751e719))

## [0.4.2](https://github.com/gb-redRabit/Onda/compare/v0.4.1...v0.4.2) (2026-09-12)


### Bug Fixes

* **ci:** run ensure-release step under bash (fixes pwsh parser error on windows) ([30f4955](https://github.com/gb-redRabit/Onda/commit/30f4955efc4313b665fa97ad6a6fac2d00ba5734))

## [0.4.1](https://github.com/gb-redRabit/Onda/compare/v0.4.0...v0.4.1) (2026-09-12)


### Bug Fixes

* **build:** unpack sharp native libs, publish installers only ([ac60ea0](https://github.com/gb-redRabit/Onda/commit/ac60ea0e7e6b2c4182c86a08b22f12237f2eb8aa))
* **ci:** bound linux smoke test, assert window-created milestone ([529efd6](https://github.com/gb-redRabit/Onda/commit/529efd6e31a23dd2161f3e65c072ba7b3b7c1a63))
* **ci:** run linux smoke test headless (xvfb + no-sandbox) ([2865fdc](https://github.com/gb-redRabit/Onda/commit/2865fdc06af2824b307654efbdcecc67d499d970))

## [Nieopublikowane]

### Naprawy bezpieczeństwa

- Media server działa teraz fail-closed — pusta whitelistta korzeni odrzuca wszystkie żądania (wcześniej przy pustej liście obsługiwał dowolną ścieżkę absolutną).
- Rooty media servera pochodzą wyłącznie z jawnie otwartych plików/folderów (biblioteka, dialogi, pliki z systemu, `media:grantAccess`), a nie z każdego przeglądanego folderu.
- Import ustawień szyfruje klucze API przed zapisem; eksport nie wypisuje sekretów (klucze API, hasło proxy).
- Guard IPC ufa tylko stronie aplikacji (`app.getAppPath()`), a nie dowolnemu URL `file:`.
- Walidacja runtime argumentów IPC dla operacji plikowych (`fs:*`), mediów i napisów (`utils/validate.ts`); zakładki/kanaly YouTube mają ograniczone zakresy, a downloader odrzuca URL-e spoza YouTube.
- Downloader zależności: limit redirectów, wymuszony HTTPS, limit rozmiaru, zapis do pliku tymczasowego z atomowym rename, timeout.
- Otwieranie plików wykonywalnych przez `shell:openWithDefault` wymaga potwierdzenia; `.lnk`/`.url` blokowane.
- `media:batchThumbnails` dodane do allowlisty preload.

### Naprawy błędów

- Przycisk „Dodaj do kolejki" na pojedynczym filmie (YouTube) nie usuwa już zaznaczenia i nie pomija dodawania.
- Ekran pobierania pokazuje właściwą finalną ścieżkę pliku (`outputPath`), a retry używa katalogu (`outputDir`).
- Ładowanie kanału YouTube nie pozostaje w stanie ładowania po błędzie (try/finally + identyfikator generacji).
- Wyścigi przy szybkiej zmianie filmu w napisach i transkodowaniu (identyfikatory generacji).
- Reset ustawień przywraca teraz grupy `explorer` i `library`.
- Nieznane rozszerzenia plików są klasyfikowane jako `unknown` (nie `video`).
- Cache miniatur i transkodów uwzględnia `mtime`, więc nadpisany plik nie pokazuje starych danych.

### Nowe funkcje

- **System wtyczek**: instalacja z folderu, lista/aktywacja/dezaktywacja/odinstalowanie, worker na wtyczkę (sandbox), karta wtyczki w Ustawieniach z Logami i statusem, manifest (uprawnienia: storage/notifications/player/visual) oraz poradnik PL/EN w Ustawieniach.
  - **Hooki i akcje**: `library:scan`, `track:queued` (hooki) oraz `player:seek`, `player:enqueue`, `track:toggleFavorite` (akcje) przez `api.on`/`api.action`.
  - **Komendy** — `api.registerCommand({ id, label, icon, action })` dostępne w palecie poleceń, na karcie wtyczki i (przy `location`) w UI.
  - **Konfiguracja** — pole `settings` w manifeście + formularz na karcie; `api.settings.get/set` (IPC `plugins:settings:*`, plik `settings.json` per wtyczka, walidacja kluczy/typów/min-max).
  - **Dekoracje** — `api.visual('element.decoration', { element, value })` nadaje dekoracje elementom widoku audio (cover/visualization/progress/trackInfo/controls), obejmuje też „Teraz odtwarzane" i mini-pasek.
  - **Skróty klawiszowe** — `api.registerCommand({ ..., shortcut })` z walidacją i odrzucaniem kolizji (ostrzeżenie w Logach); globalne działanie poza polami tekstowymi.
  - **Menu kontekstowe utworu** — komenda z `location: 'track-menu'` pojawia się w menu kontekstowym utworu w bibliotece, a `action` dostaje snapshot utworu `{ id, path, title, artist?, album?, duration?, isOnline }`.
- **Streaming online YouTube**: przycisk „Odtwórz" na kartach wyników; resolve strumienia przez yt-dlp (`-g`) + proxy media-server (CORS/range/retry 403), kolejka streamów z auto-next, cache URL-i (LRU + persystencja na dysku, TTL 5 h), prefetch przy najechaniu/podglądzie karty, status „Łączenie…/Buforowanie…" w stopce.
- **Widok „Zapisane"** (`/saved`): zapisane utwory i playlisty (bookmark na kartach), odtwarzanie playlisty live re-resolve, persystencja `saved-streams.json` (limity 500/100).
- **SoundCloud + multi-platform** (`/online`): własny klient wewnętrznego API `api-v2.soundcloud.com` (client_id wyekstrahowany z bundli, cache 24 h, refresh na 401) z automatycznym fallbackiem na yt-dlp; search/resolve/kanały (obserwujący/utwory, banner = avatar); streaming progressive MP3 przez proxy z cache respektującym ~30-minutową ważność podpisów CDN; pobieranie MP3 jako job HTTP (świeży podpisany URL przy każdej próbie). Przełącznik platform YouTube | SoundCloud, redirect `/youtube` → `/online`.
- **Subskrypcje SoundCloud**: obserwowanie artystów z pełnym auto-download nowych utworów (MP3 przez API), „pobierz wszystko" dla całego profilu, uproszczony dialog konfiguracji (folder/szablon/biblioteka), badge „SC" na karcie subskrypcji.
- **SoundCloud — domknięcie**: pobrane MP3 dostają tagi ID3 (tytuł/wykonawca) i okładkę z artwork_url; „Zapisane" obsługują SC (bookmark na kartach, zapisane sety/utwory odtwarzane po permalink); batch przyjmuje linki obu platform; utwory bez progressive transcoding pobierają się przez yt-dlp (HLS/ffmpeg); fallback yt-dlp dla snapshotu całego profilu.
- Autostart: grupa ustawień „Ogólne" (`autoLaunch`, `startMinimized`, `closeToTray`), IPC `app:getAutoLaunch`/`app:setAutoLaunch`, start zminimalizowany przez `--hidden`.
- Single-instance + otwieranie plików z systemu (`second-instance`, `open-file`, `process.argv`) i skojarzenia plików (`fileAssociations`).
- Anulowanie skanowania biblioteki (`library:scanCancel`) z przyciskiem w UI; incremental scan (niezmienione pliki są ponownie używane) i watcher plików (`chokidar`).
- Media Session API (metadata + play/pause/next/previous/seekto + artwork).

### Ulepszenia

- Optymalizacja systemu wtyczek: `logPush` bez przebudowy całej mapy logów przy każdym wpisie (mutacja w miejscu), równoległe ładowanie ustawień per-wtyczka (`Promise.all`), `dispatchCommand` trasuje bezpośrednio do workera właściciela (bez iteracji po wszystkich workerach).
- Naprawa rozwijanego panelu Logi na karcie wtyczki (niereaktywny `Set` → `ref<Set>`; wcześniej nie rozwijał się po kliknięciu).
- Hardening streamingu YT: klienty `ios_safari,tv_embedded` (audio-only itag 251, ~2× szybszy resolve) z fallbackiem `android,web`, proxy 4 próby z backoffem, fallback direct w audioEngine, kanał nightly yt-dlp.
- Pozycja odtwarzania persistowana między restartami (`electron-store`, limit 500 wpisów).
- Timeout pojedynczego zadania pobierania (30 min), wznowienie przerwanego pobierania (`--continue`) oraz limity `maxConcurrent` (10) i bufora `stderr` (64 KB).
- Limit czasu całego checkera subskrypcji (10 min).
- Miniatury YouTube z `loading="lazy"`; globalny `prefers-reduced-motion` w CSS; `aria-label` na kontrolerach odtwarzania i nawigacji.
- Instalator: `appId: com.onda.app`, `productName: Onda`, assisted NSIS z wyborem katalogu.
- Lint przechodzi (skrypt `generate-random-icon.js` wyłączony z lint).

### Dokumentacja

- `README.md` zaktualizowane (licznik testów — 703, sekcja systemu wtyczek).
- `LICENSE`: właściciel „Onda Contributors"; `SettingsAbout.vue` linkuje do realnego repozytorium.
- `RELEASE.md` z procedurą wydania; konfiguracja podpisywania przygotowana w `electron-builder.yml`/`build.yml` (aktywacja po dostarczeniu certyfikatów).
