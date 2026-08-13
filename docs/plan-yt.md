# Onda YouTube: audyt, porównanie i plan rozwoju

> Stan audytu: 13 sierpnia 2026 r.
>
> Dokument opisuje stan kodu Onda w chwili audytu. Ocena prędkości pobierania
> nie jest benchmarkiem laboratoryjnym; sukces i szybkość pobierania zależą od
> YouTube, sieci, proxy, wersji yt-dlp i dostępności FFmpeg.

## Status wdrożenia (po audycie)

Poniższe pozycje z planu P0 i P1 zostały wdrożone. Sekcje 3–4 zachowują opis
stanu z chwili audytu; przy każdej zmienionej sekcji dodano adnotację.

| Pozycja | Status | Uwagi |
| --- | --- | --- |
| P0.1 Publiczne pobieranie bez logowania | ✅ Wdrożono | Usunięto blokadę `LOGIN_REQUIRED_ERROR` w `download-manager.ts`, bramkę logowania w `subscription-checker.ts` i wymóg sesji dla okładki w `cover-processing.ts`. Dodano klasyfikację błędów yt-dlp (`error-classifier.ts`) i przycisk „Zaloguj się" w widoku pobranych tylko dla kodu `auth-required`. |
| P0.2 Ochrona cookies | ✅ Wdrożono | `writeFileRestricted` (0600 POSIX / ACL Windows) dla pliku cookies; sesja Electron jest zapisywana do pliku tymczasowego na czas procesu yt-dlp i usuwana w `finally` (`cleanupYtAuthTemp`); redakcja sekretów w błędach (`redactSecrets`); ostrzeżenie przed importem/eksportem cookies w UI. |
| P0.3 Trwała kolejka | ✅ Wdrożono | `download-queue-store.ts` (wersjonowany schemat, atomowy zapis, limit 500). Po restarcie zadania `downloading` przechodzą w `paused`, a `pending` są wznawiane przez `--continue`. |
| P0.4 Martwe obietnice w UI | ✅ Wdrożono | Usunięto panel YouTube Data API (komponent + tab + i18n). `hashFiles` ma teraz konsumenta — SHA-256 liczony po pobraniu (`hash-file.ts`) i pokazywany w widoku pobranych z przyciskiem kopiowania. |
| P1.1 Jakość i formaty | ✅ Wdrożono | 1440p/2160p; kontener MP4/MKV/WebM; audio native `best`; Opus/M4A/WAV; wybór języka ścieżki audio (`--audio-language`). |
| P1.2 Niezawodny bootstrap zależności | ✅ Wdrożono | Rozpoznawanie binarek bundlowanych z `resources/ffmpeg` (`bundledBinPath`), `extraResources` w `electron-builder.yml`, skrypt `scripts/fetch-ffmpeg.mjs` (pobiera przypięte FFmpeg/FFprobe przy buildzie, weryfikacja SHA-256). yt-dlp już przypięty do `2026.07.04` z SHA-256. |
| P1.3 Lepsza obsługa błędów | ✅ Wdrożono | Klasyfikacja + tłumaczenie błędów search/resolve/kanału/pobierania (`errorCodes.ts`, kategoria `proxy`); retry z backoffem dla `network`/`bot-block`; redakcja sekretów. |
| P1.4 Playlisty i kanały na dużą skalę | ✅ Wdrożono | Mutex auto-checku; separacja nowe/niepobrane/pobrane w `computeChannelDiff`; limit auto-load playlist (500) z przyciskiem „Wczytaj więcej"; zaznaczanie zakresu (1-100/101-200) w widoku. Stronicowane skanowanie kanału w checku odłożone (wymaga zachowania pełnej liczby `pendingCount`). |
| P1.5 Napisy i metadane | ✅ Wdrożono | Źródło napisów (ręczne/auto/oba) i format (SRT/VTT/ASS); status napisów (osadzone/zapisane/brak); opcjonalny folder `Subtitles/`; metadane (wykonawca/album/rok) + rozdziały (`--embed-chapters`). |
| P1.6 API key | ✅ Usunięto panel | Panel YouTube Data API usunięty (P0.4); provider Data v3 nie jest potrzebny — wyszukiwanie przez yt-dlp. |
| P2.1 Profesjonalna kolejka | ✅ Wdrożono | Pauza/wznowienie, priorytet, zmiana kolejności, filtrowanie, eksport/import, harmonogram rozpoczęcia i nocny. Historia = filtr „Ukończone". |
| P2.2 Batch input | ✅ Wdrożono | Wklejanie wielu URL-i, dedup po video ID, import TXT/CSV, podgląd typu per wpis i profil dla grupy. |
| P2.3 Profile pobierania | ✅ Wdrożono | Zapisane profile + wybór/zapis/usunięcie w dialogu i w konfiguracji subskrypcji; współdzielone przez film/playlistę/kanał/auto-pobieranie. |
| P2.4 Onda jako biblioteka | ✅ Wdrożono | Manifest, badż „w bibliotece", dedup po video ID, auto-playlista z kanału i aktualizacja metadanych bez ponownego pobrania. |
| P2.5 SponsorBlock i segmenty | ✅ Wdrożono | Oznaczanie i wycinanie segmentów (`sponsorblock.ts`, off/mark/remove) + przycinanie wg czasu (`trimStart`/`trimEnd`, osobne od klipa okładki). |
| P3 Fundament adaptera | 🔶 Częściowo | `MediaProvider` (`shared/provider.ts`) + adapter YouTube; reszta P3 (inne serwisy, allowlista, model metadanych) do zrobienia. |

Testy: **357 zaliczonych** (dodano klasyfikator błędów, store kolejki, haszowanie, uprawnienia plików, napisy, model kanału i pliki napisów).

## 1. Wnioski zarządcze

Onda nie jest obecnie kopią zwykłego downloadera. Jej najmocniejszy scenariusz
to lokalny obieg:

```text
wyszukaj lub otwórz YouTube
  -> wybierz materiał
  -> skonfiguruj pobieranie
  -> pobierz do kolejki
  -> zapisz metadane i okładkę
  -> zsynchronizuj z biblioteką
  -> odtwórz w Onda
```

To odróżnia ją od Cobalt, który jest głównie szybkim webowym downloaderem, oraz
od Arroxy, które jest bardziej ogólnym GUI dla yt-dlp.

Najważniejsza wada obecnego produktu jest jednak fundamentalna: kod wymaga
aktywnej sesji YouTube przed rozpoczęciem każdego pobierania. Publiczne wideo
można wyszukiwać i rozpoznawać bez logowania, ale `addDownloadJobs()` oznacza
zadanie jako błąd, gdy `getAuthStatus()` nie potwierdzi sesji
(`src/main/downloads/download-manager.ts:359-408`). Arroxy i Cobalt domyślnie
nie wymagają logowania, a 4K Video Downloader wymaga go głównie dla treści
prywatnych lub ograniczonych.

### Ocena końcowa

| Produkt                  | Ocena ogólna | Ocena samego pobierania | Najlepszy scenariusz                                         |
| ------------------------ | -----------: | ----------------------: | ------------------------------------------------------------ |
| Onda                     |   **8,0/10** |              **7,2/10** | Lokalna biblioteka, odtwarzacz i subskrypcje YouTube         |
| 4K Video Downloader Plus |   **8,6/10** |              **9,2/10** | Dopieszczone pobieranie, 8K, prywatne treści i automatyzacja |
| Arroxy                   |   **8,9/10** |              **9,0/10** | Darmowy, lokalny downloader open source oparty na yt-dlp     |
| Cobalt                   |   **8,3/10** |              **8,0/10** | Jednorazowe pobranie publicznego linku bez instalacji        |

Onda ma niższą ocenę modułu YouTube nie dlatego, że ma mało kodu, tylko
dlatego, że obecne ograniczenia dotyczą podstawowego kontraktu użytkownika:
logowania, jakości, formatów, trwałości kolejki i komunikowania błędów.

## 2. Co działa obecnie w Onda

### 2.1 Odkrywanie i rozpoznawanie YouTube

- Wyszukiwanie przez lokalne `yt-dlp`, obecnie `ytsearch50`.
- Rozpoznawanie linków do filmu, playlisty, kanału, Shorts, live i embed.
- Rozpoznawanie skróconego 11-znakowego ID filmu.
- Rozpoznawanie kanału przez handle, na przykład `@nazwa`.
- Rozwiązywanie playlist z ładowaniem kolejnych stron po 30 pozycji.
- Widok kanału z zakładkami `Wideo` i `Shorts`.
- Widok kanału w układzie kafelków albo listy.
- Nieskończone ładowanie kolejnych pozycji kanału.
- Podstawowe metadane: tytuł, opis, miniatura, kanał, liczba wyświetleń,
  data publikacji i czas trwania.
- Bezpieczna walidacja miniatur: tylko HTTPS, bez localhost i adresów loopback.

Najważniejsze pliki:

- `src/shared/youtube.ts:7-56` — klasyfikacja i normalizacja linków.
- `src/main/ipc/youtube-handlers.ts:145-353` — wyszukiwanie, playlisty,
  kanały i rozwiązywanie kolejnych stron.
- `src/main/ipc/youtube-utils.ts:220-307` — mapowanie danych yt-dlp i
  filtrowanie miniatur.
- `src/renderer/src/views/YouTubeView.vue:146-325` — interfejs wyszukiwania
  i rozpoznawania linków.

### 2.2 Pobieranie

- Audio lub wideo.
- Audio: MP3, FLAC, OGG i AAC.
- Wideo: `best`, 1080p, 720p i 480p.
- Domyślne ustawienia Smart Mode.
- Kolejka z limitem równoległości od 1 do 10; domyślnie 3.
- Progres, prędkość i ETA.
- Pauza, wznowienie, anulowanie i ponowienie.
- Limit prędkości pobierania.
- Proxy HTTP, HTTPS i SOCKS5.
- Własny katalog zapisu.
- Szablony nazw z tokenami tytułu, artysty, albumu, roku i ID.
- Foldery kanałów i playlist.
- Limit pojedynczego zadania: 30 minut.
- Wznowienie częściowego pliku przez `yt-dlp --continue`.

Implementacja znajduje się głównie w:

- `src/main/downloads/download-manager.ts:21-69` — limity, formaty i parser
  progresu.
- `src/main/downloads/download-manager.ts:154-319` — scheduler i proces yt-dlp.
- `src/main/downloads/download-manager.ts:359-481` — tworzenie i obsługa zadań.
- `src/renderer/src/views/DownloadsView.vue:67-273` — widok kolejki.

### 2.3 Okładki, metadane i biblioteka

- Miniatura YouTube jako okładka audio.
- Własny plik obrazu jako okładka.
- Klatka filmu jako okładka.
- Krótki animowany klip jako okładka WebM lub MP4.
- Nadpisanie wykonawcy, albumu i roku.
- Osadzanie metadanych przez yt-dlp.
- Usuwanie tymczasowych plików miniatur po zakończeniu.
- Automatyczna synchronizacja gotowego pliku z biblioteką Onda.
- Informacja w kolejce, czy plik znajduje się już w bibliotece.

To jest obecnie najbardziej wyróżniający element Onda. 4K i Arroxy pobierają
media, ale nie są odtwarzaczem i biblioteką z tak głęboką integracją. Onda może
wykorzystać tę przewagę zamiast konkurować wyłącznie liczbą obsługiwanych stron.

### 2.4 Napisy

- Włączanie napisów dla pojedynczego pobrania.
- Wybór wielu języków przez listę, na przykład `pl,en`.
- Pobieranie napisów ręcznych i automatycznych.
- Konwersja do SRT.
- Osadzanie napisów w pliku wideo.
- Dla audio napisy są zapisywane jako pliki obok audio.
- Napisy są traktowane jako niekrytyczny etap przez `--ignore-errors`.

Aktualny interfejs i kod są prostsze niż w Arroxy, które obsługuje SRT, VTT,
ASS, tryb sidecar, podfolder i embedding.

### 2.5 Subskrypcje i automatyzacja

- Trwałe subskrypcje kanałów w `subscriptions.json`.
- Ustawienie punktu odniesienia po zasubskrybowaniu kanału, aby nie pobrać
  całej historii bez zgody użytkownika.
- Opcja pobrania całego katalogu kanału przy subskrypcji.
- Automatyczne sprawdzanie kanałów co 6 godzin.
- Automatyczne pobieranie nowych filmów.
- Osobne preferencje kanału: rodzaj, jakość, format, okładka, napisy, folder,
  szablon nazwy oraz nadpisanie metadanych (wykonawca/album/rok).
- Deduplication przez `downloadedVideoIds` i `queuedVideoIds`.
- Powiadomienie o nowych filmach.
- Ręczne sprawdzanie jednego kanału lub wszystkich subskrypcji.

Powiązane pliki:

- `src/main/ipc/subscription-checker.ts:14-274`.
- `src/main/ipc/subscriptions-store.ts:31-152`.
- `src/main/ipc/subscriptions-handlers.ts:33-89`.
- `src/renderer/src/components/youtube/SubscribeConfigDialog.vue:134-353`.

## 3. Architektura i bezpieczeństwo

### 3.1 Mocne strony techniczne

- Electron z `sandbox: true`.
- `contextIsolation: true`.
- `nodeIntegration: false`.
- `webSecurity: true`.
- Typowane kanały IPC i allowlista preload.
- Walidacja argumentów operacji plikowych i mediów po stronie main.
- Downloader zależności używa HTTPS, limitu przekierowań, limitu rozmiaru,
  timeoutu, pliku tymczasowego i atomowego rename.
- yt-dlp dla świeżej instalacji jest przypięte do konkretnej wersji
  `2026.07.04`, a plik jest weryfikowany przez SHA-256
  (`src/main/ipc/dependency-utils.ts:22-49`, `dependency-handlers.ts:32-76`).
- Konfiguracja Electron Store jest szyfrowana losowym kluczem instalacji.
- Klucze API są dodatkowo obsługiwane przez Electron `safeStorage`.
- Media server działa fail-closed i ma whitelistę katalogów.
- W projekcie jest 321 testów jednostkowych oraz testy serwera mediów,
  subskrypcji, ustawień, zależności i narzędzi YouTube.

### 3.2 Najważniejsze ryzyko: sesja i cookies

Logowanie Google odbywa się w izolowanej partycji `persist:youtube-auth`, co jest
dobrym kierunkiem. Następnie sesja jest eksportowana do pliku
`youtube-cookies.txt` w katalogu danych użytkownika
(`src/main/youtube-auth.ts:14-30`, `157-175`). Ten plik zawiera tokeny sesji
YouTube i nie jest chroniony przez `safeStorage`; na POSIX ustawiane jest
`0600`, ale Windows nie otrzymuje w tym miejscu jawnej konfiguracji ACL.

> **Wdrożono (P0.2):** plik cookies jest zapisywany przez `writeFileRestricted`
> (0600 POSIX / ACL Windows), a sesja Electron trafia do pliku tymczasowego na
> czas procesu yt-dlp i jest usuwana w `finally` (`cleanupYtAuthTemp`). Błędy
> są redagowane przez `redactSecrets`. Import/eksport cookies ostrzega w UI.

Plan powinien ograniczyć trwałe przechowywanie cookies:

- preferować `--cookies-from-browser`, gdy jest to możliwe;
- dla sesji Electron tworzyć tymczasowy plik tylko na czas procesu yt-dlp;
- usuwać plik w `finally` po zakończeniu procesu;
- dla importu ręcznego przechowywać dane zaszyfrowane albo wymusić ACL na
  Windows;
- eksport cookies pozostawić jako świadomą funkcję z ostrzeżeniem;
- po wylogowaniu usuwać partycję i wszystkie pliki pomocnicze;
- nie umieszczać wartości cookies w logach ani raportach diagnostycznych.

### 3.3 Brak trybu anonimowego

> **Wdrożono (P0.1):** pobieranie publiczne działa bez cookies w trybie `none`.
> yt-dlp idzie ścieżką publiczną, a błąd age-restriction/login/private jest
> klasyfikowany (`error-classifier.ts`) i pokazywany jako `auth-required` z
> przyciskiem „Zaloguj się". Subskrypcje pobierają publiczne kanały bez sesji.

`getYtAuthConfig()` może zwrócić `null`, a wyszukiwanie i rozpoznawanie linków
potrafi wtedy działać. Natomiast pobieranie jest blokowane w dwóch miejscach:

- `src/main/downloads/download-manager.ts:171-176` — błąd podczas uruchomienia;
- `src/main/downloads/download-manager.ts:359-408` — zadanie jest tworzone
  od razu jako `error`, gdy użytkownik nie jest zalogowany.

To powinno zostać świadomie zmienione. Rekomendowany model:

- tryb `none` pozwala pobierać publiczne materiały bez cookies;
- yt-dlp próbuje normalnej ścieżki publicznej;
- dopiero błąd age restriction, login required, private lub bot block pokazuje
  użytkownikowi propozycję logowania/importu cookies;
- treści prywatne i ograniczone nadal wymagają sesji;
- subskrypcje mogą działać bez cookies, o ile konkretne publiczne kanały na to
  pozwalają.

Jeżeli decyzja projektowa pozostanie przy login-only, interfejs musi komunikować
to przed dodaniem zadania, a opcja `Wyłączone` nie może wyglądać jak działający
tryb pobierania.

## 4. Rzeczy obecne w UI, ale niepełne albo niepodłączone

### 4.1 Panel YouTube Data API

> **Wdrożono (P0.4):** panel usunięty z ustawień (tab + komponent + i18n).
> Infrastruktura `apiKeys` w store/schemacie pozostała jako ogólny, szyfrowany
> magazyn kluczy (może zostać użyty przy ponownym wdrożeniu providera).

`SettingsApiKeys.vue` pokazuje pola klucza API, maksymalnej liczby wyników i
kodu regionu, ale nie ma `v-model`, zapisu do store ani wywołania IPC
(`src/renderer/src/components/settings/SettingsApiKeys.vue:7-42`). W main nie
ma użycia `googleapis.com`, `youtube/v3` ani odczytu tych wartości. Wyszukiwanie
działa przez `ytsearch50`.

To jest myląca funkcja. Należy ją albo usunąć z ustawień do czasu implementacji,
albo podłączyć jako prawdziwy, opcjonalny provider wyszukiwania. Nie należy
utrzymywać martwego panelu tylko dlatego, że typy ustawień już istnieją.

### 4.2 Haszowanie plików

> **Wdrożono (P0.4):** po zakończeniu pobrania, gdy `download.hashFiles` jest
> włączone, liczony jest SHA-256 (`sha256File` w `hash-file.ts`) i pokazywany
> w widoku pobranych z przyciskiem kopiowania.

`hashFiles` jest widoczne w ustawieniach i zapisuje się w konfiguracji, ale nie
ma konsumenta w kodzie pobierania ani biblioteki. Obecnie przełącznik nie daje
użytkownikowi obiecanego efektu. Należy wdrożyć SHA-256 po zakończeniu pobrania
i pokazać wynik albo usunąć przełącznik.

### 4.3 Kolejka nie przetrwa restartu

> **Wdrożono (P0.3):** `download-queue-store.ts` zapisuje kolejkę atomowo po
> zmianie statusu (wersjonowany schemat, limit 500). Po restarcie `downloading`
> przechodzi w `paused`, a `pending` jest wznawiane przez `--continue`.

`jobs` i `queueOrder` w `download-manager.ts` są strukturami w pamięci procesu.
Po restarcie aplikacji lista zadań znika, a zadania aktywne nie są odzyskiwane.
To odróżnia Onda od pełnych menedżerów pobierania 4K i Arroxy.

Docelowo trzeba zapisywać:

- zadania `pending`, `paused`, `downloading`, `error`;
- ustawienia formatu i ścieżki;
- katalog tymczasowy i możliwość wznowienia `.part`;
- identyfikator filmu i dane subskrypcji;
- ostatni błąd w postaci klasyfikowanej, nie tylko surowego stderr.

Po restarcie zadanie `downloading` powinno zostać oznaczone jako `paused` albo
`recoverable`, nigdy jako zakończone.

## 5. Porównanie z konkurencją

| Obszar                             | Onda                                       | 4K Video Downloader Plus           | Arroxy                                    | Cobalt                            |
| ---------------------------------- | ------------------------------------------ | ---------------------------------- | ----------------------------------------- | --------------------------------- |
| Model                              | Lokalny Electron + odtwarzacz + biblioteka | Zamknięta aplikacja desktopowa     | Lokalny Electron + yt-dlp                 | Web app + opcjonalny self-host    |
| Serwisy                            | Obecnie tylko YouTube                      | Kilkanaście oficjalnie wspieranych | 2000+ przez yt-dlp                        | Około 20 głównych serwisów        |
| Publiczne pobieranie bez logowania | **Obecnie nie**                            | Tak dla części treści              | Tak                                       | Tak, dla publicznych treści       |
| Treści prywatne                    | Tak przez sesję/cookies                    | Tak, funkcja płatna                | Cookies opcjonalnie                       | Nie                               |
| Jakość wideo                       | Best/1080/720/480                          | Do 8K                              | Do 4K, HDR i wysokie FPS                  | Do 8K według dokumentacji         |
| Kontener wideo                     | Zawsze MP4                                 | MP4/MKV                            | Konfiguracja przez yt-dlp                 | MP4/WebM/MKV                      |
| Audio                              | MP3/FLAC/OGG/AAC                           | MP3/M4A/OGG                        | MP3/M4A/AAC/Opus/WAV                      | MP3/OGG/WAV/Opus                  |
| Playlisty                          | Tak, ładowanie stron i wybór               | Tak, bardzo dojrzałe               | Tak, pełna obsługa                        | Słabo, głównie pojedyncze linki   |
| Kanały                             | Tak, Wideo/Shorts                          | Tak                                | Tak                                       | Nie jako pełny menedżer kanału    |
| Subskrypcje kanałów                | Tak, auto-check co 6 h                     | Tak, automatyczny download         | Playlist sync, bez identycznej integracji | Nie                               |
| Kolejka                            | Tak, ale tylko w pamięci                   | Tak                                | Tak, rozbudowana i lokalna                | Ograniczona kolejka przetwarzania |
| Napisy                             | SRT, ręczne/auto, embedding                | SRT i wiele języków                | SRT/VTT/ASS, sidecar/embed                | Wybór języka                      |
| SponsorBlock                       | Nie                                        | Nie jako główna funkcja            | Tak                                       | Nie                               |
| Okładki                            | Miniatura, własny obraz, klatka, klip      | Miniatura i metadane               | Metadane, miniatura                       | Metadane                          |
| Biblioteka/odtwarzacz              | **Pełna integracja Onda**                  | Nie                                | Nie                                       | Nie                               |
| Proxy                              | HTTP/HTTPS/SOCKS5                          | Wbudowany proxy                    | Proxy użytkownika                         | Tunel serwera                     |
| AI audio                           | Nie                                        | Tak, premium                       | Nie                                       | Nie                               |
| Koszt                              | Darmowa                                    | Starter ograniczony, plany płatne  | Darmowa MIT                               | Darmowa, koszty self-hostu        |
| Kod                                | Publiczny                                  | Zamknięty                          | MIT open source                           | API AGPL, frontend CC-BY-NC-SA    |

### 5.1 Gdzie Onda już wygrywa

- Odtwarzacz, biblioteka, playlisty i pobieranie są jednym produktem.
- Po pobraniu plik może automatycznie trafić do biblioteki.
- Onda ma polski interfejs.
- Okładki z klatki i krótkiego klipu są bardziej wyspecjalizowane niż w
  typowych downloaderach.
- Lokalna architektura nie wymaga przesyłania pliku do serwera Cobalt.
- Subskrypcje kanałów mają baseline, deduplication i osobne preferencje.
- Onda ma restrykcyjną architekturę Electron/IPC i dobry fundament bezpieczeństwa.

### 5.2 Gdzie Onda przegrywa

- Wymaga logowania nawet dla publicznego pobierania.
- Nie oferuje 4K, 8K, MKV, WebM ani wyboru kodeka.
- Ma tylko YouTube, podczas gdy Arroxy obsługuje yt-dlp, a Cobalt wiele serwisów.
- Kolejka nie jest trwała po restarcie.
- Brakuje prawdziwego importu wielu URL-i, CSV/TXT i deduplikacji batcha.
- Nie ma SponsorBlock.
- Panel API key jest obecnie martwym UI.
- Napisy są ograniczone praktycznie do SRT i jednego mechanizmu wyboru języków.
- Sztywne 30 minut na zadanie jest ryzykowne dla długich transmisji.
- Błędy z wyszukiwania i rozwiązywania linku są częściowo połykane przez puste
  bloki `catch`, przez co użytkownik nie dostaje dobrego komunikatu.
- FFmpeg jest automatycznie zarządzany tylko na Windows; pozostałe systemy
  wymagają narzędzia systemowego lub menedżera pakietów.

## 6. Rekomendowane pozycjonowanie produktu

Nie rekomenduję obecnie konkurowania z Arroxy hasłem „2000 serwisów”. To
oznaczałoby przejęcie problemów yt-dlp, osobnych zasad każdego serwisu,
metadanych, cookies, prywatności i testów regresyjnych.

Rekomendowane pozycjonowanie:

> **Onda — lokalna biblioteka i odtwarzacz YouTube z automatycznym pobieraniem,
> okładkami, napisami i subskrypcjami kanałów.**

Priorytetem powinien być niezawodny przepływ YouTube -> biblioteka, a nie liczba
serwisów. Dopiero po stabilizacji tej ścieżki można dodać eksperymentalne
„pobierz dowolny link yt-dlp” jako osobny tryb, bez obiecywania pełnej obsługi
każdej witryny.

## 7. Plan wdrożenia

### P0 — przed kolejnym publicznym wydaniem

#### P0.1 Publiczne pobieranie bez logowania

Cel: publiczny film powinien móc zostać pobrany w trybie `none`, a logowanie
powinno być potrzebne dopiero dla materiałów ograniczonych.

Zakres:

- usunąć blokadę `LOGIN_REQUIRED_ERROR` dla trybu `none`;
- zostawić cookies dla age-restricted, private, members-only i innych błędów
  wymagających sesji;
- sklasyfikować stderr yt-dlp na `auth-required`, `bot-block`, `private`,
  `not-found`, `network`, `dependency` i `unknown`;
- pokazać w UI przycisk „Zaloguj” tylko wtedy, gdy błąd tego wymaga;
- nie oznaczać publicznego zadania jako błędnego przed uruchomieniem yt-dlp;
- dodać testy dla `none`, `electron`, `manual` i `browser`.

Kryterium akceptacji: publiczny, nieograniczony film jest pobierany bez sesji,
a materiał wymagający logowania pokazuje instrukcję zamiast niejasnego błędu.

#### P0.2 Ochrona cookies

Cel: sesja YouTube nie może pozostawać jako łatwo kopiowalny plik.

Zakres:

- tymczasowy plik cookies tworzony na czas procesu yt-dlp;
- atomowe utworzenie i usunięcie pliku w `finally`;
- ACL na Windows oraz `0600` na systemach POSIX;
- brak cookies w logach i diagnostyce;
- ostrzeżenie przed importem/eksportem cookies;
- test wylogowania sprawdzający usunięcie cookies i danych partycji;
- dokumentacja, że cookies dają dostęp do konta i nie powinny być udostępniane.

#### P0.3 Trwała kolejka

Cel: restart aplikacji nie może usuwać pracy użytkownika.

Zakres:

- osobny store kolejki z wersjonowanym schematem;
- atomowy zapis po zmianie statusu;
- zapis `pending`, `paused`, `error` i metadanych zadania;
- po restarcie `downloading` przechodzi do `recoverable`/`paused`;
- wznowienie przez istniejące `.part` i `--continue`;
- brak podwójnego enqueue po restarcie subskrypcji;
- limit historii, aby store nie rósł bez końca.

#### P0.4 Usunąć martwe obietnice z UI

Jedna z dwóch decyzji musi zostać wykonana dla każdego elementu:

- zaimplementować panel YouTube Data API, albo ukryć go do czasu implementacji;
- zaimplementować SHA-256 z `hashFiles`, albo usunąć przełącznik;
- jeśli format lub jakość nie są faktycznie obsługiwane, nie prezentować ich jako
  przyszłej obietnicy bez oznaczenia.

### P1 — konkurencyjność podstawowego downloadera

#### P1.1 Jakość i formaty

> **Wdrożono:** 1440p/2160p; wybór kontenera MP4/MKV/WebM
> (`defaultVideoContainer` + `videoContainer` w zadaniu); audio native `best`
> bez re-kodowania (`-f bestaudio/best`); Opus/M4A/WAV jako jawne konwersje.
> Listy `AUDIO_FORMATS`/`VIDEO_QUALITIES`/`VIDEO_CONTAINERS` są współdzielone w
> `src/shared/constants.ts`. Preferencje kanału pokazują teraz efektywną wartość
> (bez osobnej pozycji „Globalne" — duplikaty zniknęły; wybór równy globalnemu
> czyści pole, więc kanał dalej podąża za globalnymi). Dodano `metaOverride`
> (wykonawca/album/rok) do subskrypcji i auto-pobierania. Dialog „Konfiguracja
> pobierania" rozszerzono o rodzaj/format/jakość/jakość audio/kontener/szablon
> nazwy (jak w konfiguracji subskrypcji). Dodano wybór języka ścieżki audio
> (`audioLanguage` → `--audio-language`).

Kolejność wdrażania:

1. 1440p i 2160p.
2. Wybór MP4/MKV/WebM.
3. `best`, 1080p, 1440p, 2160p i „maksymalna dostępna”.
4. Audio „best/native” bez niepotrzebnej konwersji.
5. Opus, M4A/AAC, MP3, WAV i FLAC jako jawne operacje konwersji.
6. Opcjonalny wybór ścieżki audio i języka dubbingu.

Nie należy konwertować źródła do FLAC tylko dlatego, że użytkownik wybrał FLAC;
trzeba jasno zaznaczyć, że konwersja nie zwiększa jakości źródła.

#### P1.2 Niezawodny bootstrap zależności

> **Wdrożono:** binarki bundlowane z `resources/ffmpeg` są rozpoznawane przed
> `userData/bin` i PATH (`bundledBinPath` w `dependency-utils.ts`), `extraResources`
> w `electron-builder.yml` kopiuje je do `process.resourcesPath/ffmpeg`, a
> `scripts/fetch-ffmpeg.mjs` pobiera przypięte FFmpeg/FFprobe przy buildzie z
> weryfikacją SHA-256 (`npm run fetch:ffmpeg`). yt-dlp jest przypięty do
> `2026.07.04` z SHA-256. Uwaga: wersję FFmpeg (`FFMPEG_PINNED_VERSION`) trzeba
> ustawić na konkretny tag `autobuild-…` zamiast `latest` przy najbliższym
> buildzie. Test świeżej instalacji wciąż do napisania.

- Bundlować zgodną parę FFmpeg/FFprobe w artefaktach Windows, macOS i Linux,
  tak jak robi to Arroxy.
- Zachować przypięcie wersji i weryfikację SHA-256.
- Aktualizować yt-dlp do konkretnego tagu, nigdy do niejawnego mutable latest.
- Dodać test świeżej instalacji bez FFmpeg, bez yt-dlp i z uszkodzonym plikiem.
- Pokazywać użytkownikowi, która binarka i wersja zostały użyte.

#### P1.3 Lepsza obsługa błędów

> **Wdrożono:** błędy `search()`, `resolveLink()` i widoku kanału nie są już
> połykane — kody błędów z yt-dlp są klasyfikowane (w tym osobna kategoria
> `proxy`) i tłumaczone (PL/EN) przez `errorCodes.ts`. Pobieranie ma retry z
> backoffem dla błędów `network` i `bot-block` (maks. 3 próby, wykładniczy
> backoff), a błędów prywatności/dostępu/nieistniejącego materiału się nie
> ponawia. Błędy są redagowane (`redactSecrets`).

- Nie ukrywać błędu w `search()`, `resolveLink()` i kanałach.
- Tłumaczyć typowe błędy na polski i angielski.
- Rozdzielić błąd uwierzytelnienia, limitu, sieci, proxy, formatu i zależności.
- Dodać retry z backoffem dla błędów sieciowych.
- Nie ponawiać automatycznie błędów prywatności, praw dostępu i nieistniejącego
  materiału.
- Wyświetlać `stderr` w szczegółach diagnostycznych, ale redagować cookies,
  tokeny i hasła.

#### P1.4 Playlisty i kanały na dużą skalę

> **Wdrożono:** auto-check subskrypcji ma mutex (`checkRunning`) — równoległe
> uruchomienia (interval + „sprawdź teraz" + per-kanał) są pomijane, co zapobiega
> wyścigowi na `queuedVideoIds` i podwójnemu enqueue. Separacja „nowe /
> niepobrane / pobrane" w testowanej funkcji `computeChannelDiff` (`channel-diff.ts`,
> zwraca też `reachedBaseline`). Auto-load playlisty ma limit 500 pozycji z
> przyciskiem „Wczytaj więcej", a w widoku można zaznaczyć zakres (1-100/101-200).
> Stronicowane skanowanie kanału w checku odłożone — wymaga zachowania pełnej
> liczby `pendingCount`, więc `fetchChannelAll` pobiera cały kanał.

- Dodać limit i postęp skanowania dużej playlisty/kanału.
- Nie ładować całego kanału bez ostrzeżenia do pamięci.
- Umożliwić zakres, na przykład pozycje 1-100, 101-200 albo datę.
- Rozdzielić „nowe”, „niepobrane” i „pobrane” w modelu domenowym.
- Zabezpieczyć auto-check przed wielokrotnym równoległym uruchomieniem.
- Zapisać wynik częściowego skanowania, jeśli timeout zatrzyma checker.

#### P1.5 Napisy i metadane

> **Wdrożono:** wybór źródła napisów (ręczne / automatyczne / oba — `subsMode`) i
> formatu (SRT/VTT/ASS — `subsFormat`) w dialogu konfiguracji pobierania; logika
> w `subtitle-args.ts` (sidecar dla audio, embedding dla wideo). Po pobraniu
> wykrywany jest status napisów (`osadzone/zapisane/brak` — `subtitle-files.ts`),
> a dla audio opcjonalny folder `Subtitles/` (`subsFolder`). Metadane: nadpisanie
> wykonawcy/albumu/roku (`metaOverride`) + rozdziały (`--embed-chapters`).

- Wybór napisów ręcznych, automatycznych i „najlepszych dostępnych”.
- Format SRT, VTT i ASS.
- Tryb sidecar, embedding i folder `Subtitles`.
- Jawny status błędu napisów zamiast całkowitego ukrywania go przez
  `--ignore-errors`.
- Metadane: tytuł, kanał, data, opis, rozdziały, thumbnail i język audio.

#### P1.6 API key albo całkowite usunięcie panelu

> **Rozwiązane:** panel usunięty (P0.4). Wyszukiwanie pozostaje przez yt-dlp —
> YouTube Data API v3 nie jest potrzebne, więc quota/region nie są obsługiwane.

Jeśli API Data v3 ma zostać użyte:

- podłączyć wartości do store i walidacji;
- zapisać limit wyników i region;
- używać API wyłącznie do wyszukiwania/metadanych, nie do pobierania pliku;
- pokazać użytkownikowi zużycie quota i błąd quota exceeded;
- zachować yt-dlp jako fallback.

Jeśli nie ma takiej potrzeby, usunąć panel i zostawić wyszukiwanie yt-dlp.

### P2 — funkcje przewagi nad konkurencją

#### P2.1 Profesjonalna kolejka

> **Wdrożono:** pauza całej kolejki (`pauseAllDownloads`), wznowienie wszystkich
> (`resumeAllDownloads`), priorytet „pobierz teraz" (`moveDownloadToFront`),
> zmiana kolejności (`moveDownload`), filtrowanie po statusie i kanale,
> eksport/import kolejki, harmonogram rozpoczęcia (`scheduleDownloadStart`) i
> harmonogram nocny (`isWithinWindow` + ustawienie). Sekcję historii pełni filtr
> „Ukończone" (z czyszczeniem zakończonych).

- zmiana kolejności;
- priorytet „pobierz teraz”;
- pauza całej kolejki;
- harmonogram rozpoczęcia;
- harmonogram nocny;
- osobna sekcja historii;
- filtrowanie po kanale, statusie i folderze;
- eksport/import kolejki.

#### P2.2 Batch input

> **Wdrożono:** wklejanie wielu URL-i (textarea „Wiele linków"), parsowanie i
> dedup po video ID (`parseBatchInput`/`extractYtVideoId` w `shared/youtube.ts`),
> dodawanie do kolejki (`queueBatch`), import pliku TXT/CSV/TSV (`fs:readTextFile`),
> podgląd wykrytego typu per wpis i zastosowanie profilu do całej grupy.

- wklejanie wielu URL-i;
- import TXT/CSV;
- usuwanie duplikatów po URL i video ID;
- podgląd wykrytego typu przed dodaniem;
- możliwość zastosowania profilu do całej grupy.

#### P2.3 Profile pobierania

> **Wdrożono:** zapisane profile (`download-profiles.ts` + IPC
> `profiles:list/save/delete`), obsługa w dialogu konfiguracji (wybór, zapis,
> usunięcie, zastosowanie) oraz wybór profilu w konfiguracji subskrypcji kanału
> (profil wypełnia preferencje kanału, łącznie z formatem/trybem/folderem napisów).
> Profile są współdzielone przez pojedynczy film, playlistę, kanał i
> auto-pobieranie.

Wzorem Arroxy warto dodać zapisane profile, na przykład:

- „Muzyka MP3 z okładką”;
- „Wideo 2160p MKV”;
- „Napisy PL + EN”;
- „Archiwizacja kanału”;
- „Lekki plik 720p”.

Profile powinny być współdzielone przez pojedynczy film, playlistę, kanał i
auto-pobieranie.

#### P2.4 Onda jako biblioteka YouTube

> **Wdrożono:** plik manifestu (`Title.onda.json`), badż „w bibliotece" + link
> „otwórz w bibliotece", dedup po video ID przy dodawaniu do kolejki, automatyczna
> playlista Onda z kanału YouTube (`channel-playlist.ts`), aktualizacja metadanych
> bez ponownego pobrania (`yt:download:updateMetadata`), przycisk „odtwórz" w
> widoku Pobrane oraz opcjonalne „automatycznie dodawaj folder pobierania do
> biblioteki" (`autoAddDownloadFolder`).

To powinno pozostać głównym wyróżnikiem produktu:

- podgląd, czy materiał jest już w bibliotece;
- wykrywanie duplikatów po video ID i hash pliku;
- aktualizacja metadanych bez ponownego pobrania;
- odtwarzanie playlisty kanału po pobraniu;
- link „otwórz w bibliotece” po ukończeniu;
- playlisty Onda tworzone automatycznie na podstawie kanału YouTube;
- opcjonalny zapis pliku manifestu z oryginalnym URL-em i datą pobrania.

#### P2.5 SponsorBlock i segmenty

> **Wdrożono:** SponsorBlock — oznaczanie segmentów jako rozdziałów
> (`--sponsorblock-mark`) i wycinanie (`--sponsorblock-remove`) przez
> `sponsorblock.ts` + wybór w dialogu konfiguracji (off/mark/remove). Przycinanie
> materiału według czasu (`trimStart`/`trimEnd` → `--download-sections`) jest
> osobną opcją od „klip jako okładka".

- pomijanie sponsorów przy pobieraniu;
- oznaczanie segmentów w rozdziałach;
- opcjonalne przycinanie materiału według czasu;
- wyraźne rozdzielenie „klip jako okładka” od „przycięty plik wideo”.

### P3 — rozwój poza podstawowy YouTube

> **Wdrożono (fundament):** adapter `MediaProvider` (`shared/provider.ts`) z
> pierwszym adapterem YouTube (`resolveProvider`, `canResolve`/`kind`/
> `normalizeUrl`/`buildWatchUrl`), użyty w walidacji zadań w `download-manager.ts`
> i w budowaniu URL w `buildJob`. Dodanie kolejnego serwisu = nowy adapter, bez
> przepisywania kolejki/biblioteki/widoku. Reszta P3 pozostaje do zrobienia.

- Eksperymentalne URL-e innych serwisów przez yt-dlp.
- Allowlista serwisów i jawne oznaczenie jakości obsługi.
- Osobny model metadanych dla TikTok, Vimeo, SoundCloud i innych źródeł.
- Nie obiecywać „2000 serwisów” bez testów regresyjnych.
- Rozważenie trybu bez interfejsu do automatycznych zadań, jeśli pojawi się
  zapotrzebowanie na serwer domowy.

Ten etap nie powinien blokować jakości YouTube, biblioteki i odtwarzacza.

## 8. Plan techniczny zmian

### 8.1 Model domenowy pobierania

Obecny `IpcDownloadTask` łączy dane wejściowe, stan procesu, prezentację i
wynik. Przy trwałej kolejce warto rozdzielić:

- `DownloadRequest` — URL, provider i preferencje;
- `DownloadRuntime` — PID, postęp, prędkość i bieżąca faza;
- `DownloadResult` — plik, hash, metadane i synchronizacja z biblioteką;
- `DownloadError` — kod, komunikat użytkownika i szczegóły techniczne.

Proponowane fazy:

```text
created -> probing -> waiting -> downloading -> postprocessing -> syncing -> completed
                         |             |             |
                         +-> paused    +-> retryable +-> error/cancelled
```

Nie należy przechowywać obiektu `ChildProcess` w danych utrwalanych.

### 8.2 Granica IPC

Obecna allowlista preload i typowane kanały są dobrym fundamentem. Nowe kanały
powinny:

- przyjmować wyłącznie jawne schematy danych;
- walidować URL, zakres playlisty, katalog i format w main;
- nie przyjmować dowolnego fragmentu argumentów yt-dlp z renderera;
- zwracać kod błędu zamiast surowego wyjątku;
- redagować sekrety przed logowaniem.

### 8.3 Format i provider

Nie należy kodować całej logiki pod `youtube.com/watch` w każdym module.
Warto wprowadzić adapter:

```ts
interface MediaProvider {
  id: string;
  canResolve(url: string): boolean;
  resolve(input: ResolveInput): Promise<ResolveResult>;
  buildDownload(request: DownloadRequest): DownloadPlan;
}
```

Pierwszym adapterem pozostaje YouTube. Pozwoli to później dodać inne serwisy
bez przepisywania kolejki, biblioteki i widoku pobierania.

## 9. Kryteria jakości i testy akceptacyjne

### 9.1 Scenariusze obowiązkowe

1. Publiczny film bez logowania.
2. Publiczny film z logowaniem Google.
3. Film age-restricted.
4. Film prywatny bez dostępu.
5. Playlist 30, 100 i ponad 500 pozycji.
6. Kanał z osobnym tabem Shorts.
7. Kanał z więcej niż 1000 filmów.
8. Auto-pobieranie po restarcie aplikacji.
9. Pobieranie równoległe, pauza, wznowienie i anulowanie.
10. Restart aplikacji podczas pobierania.
11. Wygasłe lub uszkodzone cookies.
12. Brak yt-dlp, brak FFmpeg i uszkodzona suma kontrolna.
13. 2160p, HDR, 60 FPS i dostępne audio wielokanałowe.
14. Napisy ręczne i automatyczne w kilku językach.
15. Proxy z hasłem i bez hasła.
16. Ścieżka Windows z niedozwolonymi znakami i bardzo długą nazwą.
17. Duplikat tego samego video ID w dwóch playlistach.
18. Materiał usunięty, zablokowany regionalnie i niedostępny sieciowo.

### 9.2 Kryteria produktu

- Pierwsze udane publiczne pobranie bez logowania po instalacji zależności.
- Brak utraty kolejki po restarcie.
- Brak pozostawionych cookies po wylogowaniu.
- Każdy błąd pobierania ma kod i komunikat możliwy do zrozumienia przez
  użytkownika.
- Jedno ustawienie formatu jest widoczne i obowiązuje identycznie dla pobrania
  ręcznego, playlisty, kanału i auto-pobierania.
- Pobranie materiału do folderu biblioteki kończy się automatycznym wpisem w
  bibliotece bez ręcznego ponownego skanowania.
- Testy regresyjne obejmują wszystkie ścieżki uwierzytelnienia.

### 9.3 Stan bazowy testów

W chwili audytu:

- `npm test` — **19 plików testowych, 321 testów zaliczonych**;
- `npm run typecheck` — `typecheck:node` i `typecheck:web` zaliczone;
- aktualne testy dobrze pokrywają narzędzia, walidację, media server,
  ustawienia, cookies helpery i store subskrypcji;
- brakuje pełnego testu procesu downloadera, trwałości kolejki, pobierania bez
  sesji, klasyfikacji błędów yt-dlp i integracji z zależnościami.

Po wdrożeniu P0.1–P0.4 oraz P1.1–P1.6:

- `npm test` — **30 plików testowych, 375 testów zaliczonych**;
- dodano testy klasyfikatora błędów (`error-classifier.test.ts`), store kolejki
  (`download-queue-store.test.ts`), haszowania (`hash-file.test.ts`), uprawnień
  plików (`file-permissions.test.ts`), napisów (`subtitle-args.test.ts`,
  `subtitle-files.test.ts`), modelu kanału (`channel-diff.test.ts`), batch inputu
  (`extractYtVideoId`/`parseBatchInput` w `youtube-utils.test.ts`), manifestu
  (`manifest.test.ts`), SponsorBlock (`sponsorblock.test.ts`), adaptera providera
  (`provider.test.ts`) i harmonogramu (`schedule.test.ts`);
- nadal brakuje pełnego testu procesu downloadera, świeżej instalacji zależności
  oraz integracji z FFmpeg/yt-dlp.

## 10. Bezpieczeństwo, prywatność i wydanie

- Onda nie powinna wysyłać plików do zewnętrznego serwera; pobieranie pozostaje
  lokalne przez yt-dlp.
- Do YouTube, GitHuba i dostawców zależności trafiają jednak żądania sieciowe,
  a proxy może zmienić ich trasę.
- W analizowanym kodzie nie znaleziono osobnego systemu telemetrii produktu.
- Lokalny log może zawierać URL-e, błędy i ścieżki; diagnostyka musi je
  redagować przed eksportem.
- Cookies YouTube są sekretem wyższego ryzyka niż zwykła konfiguracja.
- `electron-store` jest szyfrowany, ale ochrona nie zastępuje uprawnień systemu
  i nie chroni przed złośliwym procesem działającym jako ten sam użytkownik.
- Windows nie jest obecnie podpisany, a macOS ma `notarize: false`
  (`electron-builder.yml:32-60`). To obniża zaufanie do instalatora bardziej
  niż w dojrzałym produkcie komercyjnym.
- Następny etap wydania powinien obejmować certyfikat Windows, Developer ID i
  notaryzację macOS, a także weryfikację artefaktów SHA-512.

Pobieranie musi być opisane jako funkcja dla materiałów, które użytkownik ma
prawo zapisać. Aplikacja nie powinna sugerować obchodzenia DRM, paywalla ani
uprawnień do cudzych treści.

## 11. Decyzje do podjęcia

> Po audycie decyzje 1–3 zostały wdrożone zgodnie z rekomendacjami (publiczne
> pobieranie bez logowania: tak; logowanie tylko dla treści chronionych: tak;
> panel YouTube Data API: usunięty). Decyzje 4–6 pozostają otwarte.

Przed rozpoczęciem P0 trzeba potwierdzić:

1. Czy Onda ma wspierać publiczne pobieranie bez logowania? Rekomendacja: **tak**.
2. Czy logowanie ma być wymagane wyłącznie dla materiałów chronionych?
   Rekomendacja: **tak**.
3. Czy YouTube Data API ma być wspierane, czy panel należy usunąć?
   Rekomendacja: **usunąć panel teraz albo zaimplementować go w osobnym zadaniu**.
4. Czy głównym celem pozostaje YouTube + biblioteka, czy aplikacja ma stać się
   ogólnym downloaderem? Rekomendacja: **najpierw YouTube + biblioteka**.
5. Czy cookies mają być przechowywane trwale? Rekomendacja: **nie; plik
   tymczasowy i jawny eksport tylko na żądanie**.
6. Czy format FLAC ma oznaczać konwersję, czy zachowanie najlepszego źródła?
   Rekomendacja: rozdzielić `native/best` od `convert to FLAC`.

## 12. Źródła porównania

- [Onda README](../README.md)
- [Onda zasady rozwoju](./zasady.md)
- [4K Video Downloader Plus](https://www.4kdownload.com/products/videodownloaderplus)
- [Cennik 4K Video Downloader Plus](https://www.4kdownload.com/buy/videodownloaderplus)
- [Oficjalnie wspierane serwisy 4K](https://www.4kdownload.com/faq/faq-what-sites-are-supported/1)
- [Arroxy GitHub](https://github.com/antonio-orionus/Arroxy)
- [Arroxy latest release](https://github.com/antonio-orionus/Arroxy/releases/latest)
- [Cobalt GitHub](https://github.com/imputnet/cobalt)
- [Cobalt API i obsługiwane serwisy](https://github.com/imputnet/cobalt/blob/main/api/README.md)
- [Cobalt privacy](https://cobalt.tools/about/privacy)
- [Cobalt terms and ethics](https://cobalt.tools/about/terms)
