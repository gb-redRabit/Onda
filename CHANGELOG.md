# Changelog

Wszystkie istotne zmiany w projekcie Onda są dokumentowane w tym pliku.

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

- Autostart: grupa ustawień „Ogólne" (`autoLaunch`, `startMinimized`, `closeToTray`), IPC `app:getAutoLaunch`/`app:setAutoLaunch`, start zminimalizowany przez `--hidden`.
- Single-instance + otwieranie plików z systemu (`second-instance`, `open-file`, `process.argv`) i skojarzenia plików (`fileAssociations`).
- Anulowanie skanowania biblioteki (`library:scanCancel`) z przyciskiem w UI; incremental scan (niezmienione pliki są ponownie używane) i watcher plików (`chokidar`).
- Media Session API (metadata + play/pause/next/previous/seekto + artwork).

### Ulepszenia

- Pozycja odtwarzania persistowana między restartami (`electron-store`, limit 500 wpisów).
- Timeout pojedynczego zadania pobierania (30 min), wznowienie przerwanego pobierania (`--continue`) oraz limity `maxConcurrent` (10) i bufora `stderr` (64 KB).
- Limit czasu całego checkera subskrypcji (10 min).
- Miniatury YouTube z `loading="lazy"`; globalny `prefers-reduced-motion` w CSS; `aria-label` na kontrolerach odtwarzania i nawigacji.
- Instalator: `appId: com.onda.app`, `productName: Onda`, assisted NSIS z wyborem katalogu.
- Lint przechodzi (skrypt `generate-random-icon.js` wyłączony z lint).

### Dokumentacja

- `README.md` zaktualizowane (Electron 43.2, liczba testów, usunięte nieistniejące zależności i Media Session API, opis serwera z tokenem).
- `LICENSE`: właściciel „Onda Contributors"; `SettingsAbout.vue` linkuje do realnego repozytorium.
- `RELEASE.md` z procedurą wydania; konfiguracja podpisywania przygotowana w `electron-builder.yml`/`build.yml` (aktywacja po dostarczeniu certyfikatów).
