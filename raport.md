# Raport techniczny aplikacji Onda

## 1. Podsumowanie

Aplikacja Onda to desktopowy odtwarzacz oparty na Electron + Vue 3 + TypeScript. Architektura jest podzielona na trzy główne warstwy:
- `main` — proces Node/Electron
- `preload` — most IPC do renderer
- `renderer` — Vue 3, Pinia, moduły aplikacji

Projekt ma silne podstawy: modułową strukturę, wirtualizację list, obsługę napisów, PiP, bibliotekę mediów oraz zewnętrzne narzędzia do transkodowania i ekstrakcji czcionek.

Jednocześnie istnieją istotne obszary wymagające poprawy w zakresie stabilności, typowania, testów, kompletności funkcji i bezpieczeństwa.

## 2. Architektura i kluczowe elementy

### 2.1 Warstwa main

- `src/main/index.ts` — okno główne, splash screen, tray, globalne skróty, `createMediaServer`, rejestracja IPC.
- `src/main/media-server.ts` — lokalny serwer HTTP służący do przekazywania plików multimedia do `<audio>`/`<video>`.
- `src/main/ipc/*` — handlery dla dysku, mediów, bibliotek, zależności, napisów, YouTube.
- `src/main/pip-manager.ts` i `src/main/audio-pip-manager.ts` — wsparcie PiP.

### 2.2 Warstwa preload

- `src/preload/index.ts` — `window.api` z `invoke/send/on/once`.
- Obecnie API jest ogólnym wrapperem bez silnej walidacji typów.
- `src/preload/index.d.ts` definiuje interfejs, ale typy są w dużej mierze ogólne i `any`.

### 2.3 Warstwa renderer

- `src/renderer/src/main.ts` — rejestracja modułów i uruchomienie Vue.
- `src/renderer/src/modules/ModuleManager.ts` — lifecycle modułów.
- `src/renderer/src/modules/audioEngine.ts` — silnik audio / EQ / secondary audio / analiza.
- `src/renderer/src/composables` — zarządzanie multimediami, PiP, napisy, otwieranie plików.
- `src/renderer/src/stores` — Pinia stores: player, settings, library, explorer, ui, youtube.
- `src/renderer/src/views` — główne ekrany aplikacji.

## 3. Najważniejsze problemy

### 3.1 Nierówna implementacja modułów

`ModuleManager` deklaruje lifecycle dla wszystkich modułów, lecz wiele modułów implementuje tylko prosty `activate()`/`deactivate()`.
- `PlayerModule` jest jedynym modułem z rzeczywistym `init()`.
- `ExplorerModule`, `LibraryModule`, `SettingsModule`, `HomeModule`, `YouTubeModule` mają trywialne metody.

Ryzyko:
- narastająca złożoność i niekonsekwencja
- trudny do przewidzenia stan przy przełączaniu tras
- potencjalne wycieki zasobów przez puste lub częściowo zaimplementowane `deactivate()`

### 3.2 Niewystarczające typowanie IPC i preload

- `src/preload/index.ts` używa ogólnych `string`/`unknown` w metodach IPC.
- `src/shared/types/ipc.ts` zawiera typy, ale wiele wyników jest `unknown`, a kanały `yt:*` nie są sprecyzowane.
- `src/renderer/src/utils/ipc.ts` próbuje wprowadzić typy, lecz jest to jedynie warstwa rzutowania do typu `IpcChannels[C]['result'] | null`.

Ryzyko:
- błędy runtime przy zmianie kanałów IPC
- trudny refactoring `preload` / `main`
- brak sprawdzania typów w `window.api.invoke(...)`

### 3.3 Brak kompletnej integracji YouTube

- `src/main/ipc/youtube-handlers.ts` zwraca komunikat "not yet implemented" dla wszystkich kanałów.
- `src/renderer/src/views/YouTubeView.vue` zawiera UI wyszukiwania, ale funkcjonalność jest tylko szkicem.

Ryzyko:
- ciężko ocenić zawartość funkcji, ponieważ frontend i backend nie współpracują jeszcze poprawnie.
- funkcja widoczna w UI jest martwa bez backendu.

### 3.4 Zewnętrzne zależności i instalacja

- `src/main/ipc/dependency-handlers.ts` instaluje `ffmpeg`, `yt-dlp`, `mkvtoolnix` przy użyciu `choco`, `brew`, `apt-get`.
- `installYtdlp` pobiera `yt-dlp.exe` bez uwzględnienia systemów nie-Windowsowych.
- `SettingsDependencies.vue` pokazuje UI, ale nie obsługuje dużej części scenariuszy błędów.

Ryzyko:
- błędne instalacje na macOS/Linux
- funkcje transkodowania i ekstrakcji napisów mogą być niedostępne
- brak jasnych komunikatów o trybie degradacji

### 3.5 Zarządzanie audio / wideo

- `audioEngine.ts` ma wiele połączeń węzłów Web Audio i ręczne `disconnect()` / `connect()`.
- potencjalny problem z `createMediaElementSource` przy ponownym użyciu źródeł.
- `connectVideoElement()` jest niemal pusty, a `disconnectVideoElement()` jest pustą metodą.
- `useVideoPlayer.ts` samodzielnie obsługuje transkodowanie audio za pomocą chunk-first i full audio danych.

Ryzyko:
- niestabilna obsługa nowych plików wideo z AC3/DTS
- możliwe błędy stanu, gdy element wideo ładuje się wielokrotnie
- trudne debugowanie połączeń audio / secondary audio

### 3.6 Typy i `any`

- wiele plików używa `any`, np. `MusicBrainzLookup.vue`, `useSubtitleRenderer.ts`, `preload/index.d.ts`, `ipc.ts`.
- ręczne `console.error` w preload i handlerach.

Ryzyko:
- poważna utrata wartości TypeScript w ważnych obszarach
- trudne do wykrycia regresje

### 3.7 Potencjalne problemy bezpieczeństwa i wykonania poleceń

- `src/main/ipc/library-handlers.ts` wykonuje `ffprobe` z parametrem ścieżki pliku z otoczeniem w cudzysłowach.
  - Jeśli ścieżka zawiera znaki specjalne/cudzysłowy, istnieje ryzyko wstrzyknięcia.
- `dependency-handlers.ts` używa `execAsync` z komendami shellowymi, które mogą zachowywać się inaczej na różnych platformach.

Ryzyko:
- możliwe ataki na ścieżki plików w nowych scenariuszach
- niestabilność instalacji zależności

### 3.8 Brak testów krytycznych i niska pokrycie istotnych ścieżek

- Projekt ma testy, lecz większość kluczowych warstw (`audioEngine`, `useVideoPlayer`, `ModuleManager`, IPC, `dependency-handlers`) nie wydaje się pokryta.
- Obecne testy koncentrują się na prostych utilach i store.

Ryzyko:
- regresje przy zmianach w krytycznych funkcjach odtwarzania
- niepewność przy modernizacji architektury

## 4. Proponowane optymalizacje i poprawki

### 4.1 Poprawa architektury modułów

- podziel moduły na:
  - pełne moduły z lifecycle `init` / `activate` / `deactivate` / `destroy`
  - proste moduły tylko z `activate` i ewentualnym `deactivate`
- uprość `ModuleManager` i usuń niepotrzebne `destroy()` w prostych modułach.
- rozważ przeniesienie logiki uruchamiania `LibraryModule`/`ExplorerModule` do store'ów lub widoków, jeśli moduł nie ma własnych zasobów.
- doprecyzuj przypadki w `router.beforeEach` dla audio działa w tle, aby uniknąć zagnieżdżonych stanów.

### 4.2 Ustrukturyzowanie IPC/preload

- w `preload/index.ts` zastąp ogólne `any`/`unknown` silniejszym typowaniem.
- napraw interfejsy w `src/preload/index.d.ts`, aby zwracały dokładne typy, np. `yt:search`, `pip:*`, `media:*`.
- przekształć `api.invoke` w bazowy typowy wrapper, który mapuje kanały na typy z `src/shared/types/ipc.ts`.
- usuń ogólne `console.error` i zamień na `logger` lub definiowany format błędów.
- dodaj obsługę błędów po stronie renderer dla nieudanych wywołań, zamiast ignorować.

### 4.3 Doprecyzowanie typów i ograniczenie `any`

- zastąp `any` w kluczowych miejscach strukturami typów:
  - `MusicBrainzLookup.vue`
  - `useSubtitleRenderer.ts`
  - `src/main/ipc/*`
  - `src/renderer/src/stores/youtube.ts`
- przejdź z `Record<string, unknown>` na dokładne typy ustawień, playlist i metadanych.

### 4.4 Stabilizacja funkcji YouTube

- jeśli integracja YouTube ma być częścią produktu, zaimplementuj backendowe handlery w `src/main/ipc/youtube-handlers.ts` oraz wywołania w sklepie i widoku.
- rozważ użycie `yt-dlp` z API lub uruchamianie binarnego w wersji lokalnej, z bezpiecznym zarządzaniem ścieżką.
- jeśli funkcja jest roadmapą, usuń lub ukryj UI do czasu pełnej implementacji, aby nie tworzyć wrażenia fałszywej funkcjonalności.

### 4.5 Udoskonalenie instalacji zewnętrznych narzędzi

- popraw `installYtdlp` tak, aby działał na wszystkich platformach, a nie tylko Windows.
- rozdziel `yt-dlp` od `FFmpeg` w logice instalacji i wykrywania.
- dodaj lepsze błędy w `SettingsDependencies.vue` oraz tryb degrade, gdzie brak narzędzia nie blokuje reszty aplikacji.
- rozważ zastosowanie bundlowanej wersji `yt-dlp` lub automatycznej instalacji w katalogu użytkownika.

### 4.6 Refaktor `audioEngine` i wideo

- uprość połączenia Web Audio, unikając ponownego użycia `MediaElementAudioSourceNode` bez bezpiecznego restartu.
- przenieś część logiki do oddzielnych metod, by zmniejszyć złożoność połączeń `connectAudio()` / `ensureEqChain()`.
- dokończ implementację `disconnectVideoElement()` lub usuń, jeśli jest nieużywana.
- testuj scenariusze `audio + video` z kolejką i PiP, by zapewnić brak konfliktów w stanie.

### 4.7 Poprawa cache i wydajności sklepów

- `LibraryStore` ma cache `artists`/`albums` oparty na zsumowanym hash'u ścieżek, co może być problematyczne przy aktualizacjach metadanych bez zmiany ścieżki.
- `coverCache` w `player.ts` powinno być zrobione jako `ref<Map<string, CoverResult>>` lub `reactive<Record<string, CoverResult>>` z czytelnym API.
- rozważ asynchroniczne batchowanie i batch load w `LibraryView`/`ExplorerView`, które już używają wirtualizatora.

### 4.8 Usprawnienia w renderowaniu i UI

- `SettingsDependencies.vue` i `YouTubeView.vue` warto dopracować pod względem stanu błędów i designu.
- `ExplorerView` oraz `LibraryView` mają duży kod renderujący; warto wydzielić logikę do composables i poprawić czytelność.
- dodaj widoczny stan ładowania / błędów do `library.scanFolders()` i `explorer`.

### 4.9 Poprawa bezpieczeństwa `media-server`

- serwer akceptuje absolutną ścieżkę, co jest konieczne, ale warto dodać sprawdzanie, czy plik znajduje się w akceptowanym katalogu lub dodać whitelistę, jeśli to możliwe.
- obecne `normalize()` + `isAbsolute()` wystarczą dla zapobiegania path traversal w przypadku URL-a, ale nie walidują ścieżek użytkownika.
- wprowadź logging i obsługę błędów dla `http`/`stream`.

### 4.10 Testy i proces CI

- dodaj testy dla:
  - `audioEngine`, `useVideoPlayer`, `useSubtitleRenderer`
  - `ModuleManager` i przełączania tras
  - `window.api` / preload / IPC
  - `dependency-handlers` oraz fallbacków instalacji
  - `LibraryStore` / `PlayerStore` / `SettingsStore`
- uruchom CI z `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## 5. Braki funkcjonalne i możliwości rozwoju

### 5.1 Braki i luki

- kompletna integracja YouTube i obsługa pobierania
- edycja skrótów klawiszowych w UI
- import/export playlisty (`.m3u`, JSON)
- autostart systemowy i powiadomienia o aktualizacjach
- plug-in system i rozszerzalność funkcjonalna
- wsparcie dla strumieniowania z HTTP radio / HLS / DASH
- obsługa `onda://` lub rejestracja typów plików
- dokładne testy E2E i ciągła integracja

### 5.2 Możliwości rozwoju

- rozszerzenia biblioteki: inteligentne playlisty, rekomendacje, automatyczna detekcja albumów
- bardziej zaawansowane wizualizacje audio z sync BPM / beat detection
- tryby oszczędzania zasobów w PiP i audio-only
- wsparcie dla zdalnego sterowania przez sieć / wsparcie dla API lokalnego serwera
- integracja z Last.fm / scrobbling
- lepsza obsługa metadanych video: chapters, multi-audio, multiple subtitles
- tryb offline / import z folderów NAS

## 6. Priorytety naprawcze

### Priorytet 1 — krytyczne

1. Naprawa IPC / preload / typowania kanałów.
2. Stabilizacja silnika audio i transkodowania video.
3. Poprawa zewnętrznych zależności i ich instalacji.
4. Uporządkowanie modułów i przejrzystość lifecycle.

### Priorytet 2 — wysokie

1. Dodanie testów jednostkowych i integracyjnych dla kluczowych funkcji.
2. Zamiatanie `any` i usunięcie niespójnych typów.
3. Dokończenie lub ukrycie funkcji YouTube.
4. Refaktoryzacja cache i store’ów biblioteki.

### Priorytet 3 — średnie

1. Poprawa UX w ustawieniach zależności.
2. Wydajność w dużych bibliotekach i listach.
3. Lepsze logowanie i obsługa błędów.

### Priorytet 4 — niskie

1. Dodanie auto-update / instalatora.
2. Rozszerzenie funkcji playlist / eksportu.
3. Rozbudowa PiP i multi-window.

## 7. Rekomendacje dalsze

- Utrzymuj wyraźne granice między `main`, `preload` i `renderer`.
- Traktuj `youtube` jako osobny backlog, dopóki nie będzie kompletnej implementacji.
- Wprowadź sprawdzone scenariusze testowe dla odtwarzania audio/video oraz obsługi plików specjalnych.
- Dokumentuj krytyczne komponenty architektury i policz ich zależności.
- Wdroż CI/CD oraz automatyczne testy dla zmian w IPC.
