export default {
  plugins: {
    title: 'Wtyczki Onda',
    description:
      'Rozszerzenia sandboksowane w osobnym workerze. Dane i dostęp sieciowy kontroluje manifest.',
    empty: 'Brak zainstalowanych wtyczek.',
    installFromFolder: 'Instaluj z folderu',
    examplesTitle: 'Przykłady',
    examplesDesc:
      'Przykładowe wtyczki. Instalacja pozostawia je wyłączone; przed uruchomieniem przejrzysz ich dostęp.',
    examplesInstall: 'Zainstaluj',
    examplesInstalled: 'Zainstalowana',
    examplesError: 'Nie udało się zainstalować przykładu',
    installSuccess: 'Wtyczka została zainstalowana',
    installDisabledHint: 'Pozostaje wyłączona. Włącz ją, aby przejrzeć wymagane uprawnienia.',
    enableConfirmTitle: 'Przejrzyj dostęp wtyczki',
    enableConfirmWarning:
      'Po włączeniu kod wtyczki będzie uruchamiany w izolowanym workerze i otrzyma poniższy dostęp.',
    permissionChangedWarning:
      'Zakres dostępu lub kod wtyczki zmieniły się od ostatniego uruchomienia. Zatwierdź je ponownie, aby włączyć wtyczkę.',
    requestedPermissions: 'Żądane uprawnienia',
    noOptionalPermissions: 'Wtyczka nie żąda opcjonalnych uprawnień.',
    permissionStorage: 'Odczyt i zapis własnego, trwałego magazynu wtyczki.',
    permissionNotifications: 'Wyświetlanie powiadomień w interfejsie Onda.',
    permissionPlayer: 'Sterowanie odtwarzaniem, kolejką i ulubionymi.',
    permissionVisual: 'Ustawianie dekoracji obsługiwanych przez widok audio.',
    permissionNetwork: 'Wykonywanie żądań sieciowych przez proxy Onda.',
    networkAllowlist: 'Dozwolone wzorce adresów:',
    requestedHooks: 'Zdarzenia, których nasłuchuje wtyczka',
    hooksDescription:
      'Hooki przekazują metadane utworu lub pobrania; niektóre payloady zawierają ścieżki plików i URL-e.',
    noHooksRequested: 'Wtyczka nie subskrybuje zdarzeń.',
    requestedVisualSlots: 'Deklarowane warianty wyglądu',
    requestedUiSlots: 'Zadeklarowane sloty UI (tekst renderowany przez aplikację)',
    uiSlotTextOnly: 'wtyczka pisze tylko tekst; aplikacja rysuje własny layout',
    enableCancel: 'Anuluj',
    enableConfirm: 'Zatwierdź i włącz',
    enable: 'Przejrzyj uprawnienia i włącz',
    disable: 'Wyłącz wtyczkę',
    uninstall: 'Odinstaluj wtyczkę',
    enableFailed: 'Nie udało się włączyć wtyczki',
    installError: 'Nie udało się zainstalować wtyczki',
    permissionReviewRequired: 'Wymaga ponownego zatwierdzenia dostępu',
    refresh: 'Odśwież',
    enabled: 'Włączona',
    logs: 'Logi',
    noLogs: 'Brak wpisów.',
    commands: 'Komendy',
    settings: 'Konfiguracja',
    guide: {
      title: 'Poradnik wtyczek',
      searchPlaceholder: 'Szukaj w poradniku (np. slot, spectrum, storage)…',
      searchEmpty: 'Brak sekcji pasujących do zapytania.',
      copyCode: 'Kopiuj kod',
      intro:
        'Wtyczki pozwalają rozszerzyć Onda małymi programami w JavaScripcie. Działają w bezpiecznym, sandboksowanym workerze, więc jedynym kanałem komunikacji z aplikacją jest obiekt api. Poniżej znajdziesz opis, co wtyczka może robić, jak ją zainstalować i jak napisać własną.',
      sections: [
        {
          heading: 'Czym jest wtyczka?',
          body: 'Wtyczka to rozszerzenie Onda napisane w JavaScripcie, wykonywane w osobnym, sandboksowanym workerze. Nie ma dostępu do okna aplikacji ani do DOM — jedynym kanałem komunikacji jest obiekt api. Uprawnienia (dane, sieć, odtwarzacz, powiadomienia, wygląd) są deklarowane w manifeście, a każde żądanie sieciowe jest dodatkowo filtrowane przez proces główny.'
        },
        {
          heading: 'Struktura wtyczki',
          body: 'Każda wtyczka zajmuje własny katalog. Nazwa katalogu staje się identyfikatorem wtyczki.',
          list: [
            'manifest.json — metadane i uprawnienia (opis poniżej)',
            'index.js — kod wtyczki; ścieżka względna podana w polu entry',
            'Dozwolone znaki w identyfikatorze: małe litery, cyfry oraz - _ i . (np. hello, triangle); inne nazwy katalogów zostaną odrzucone',
            'Zatwierdzenie użytkownika dotyczy pliku wskazanego przez entry — dodatkowe pliki w katalogu są przez aplikację kopiowane, ale nie są częścią obliczanego skrótu.'
          ]
        },
        {
          heading: 'Instalacja i zarządzanie',
          body: 'Wtyczkami zarządza się w ustawieniach aplikacji.',
          list: [
            'Ustawienia → Wtyczki → Instaluj z folderu — wybierz katalog wtyczki. Pliki są kopiowane do danych aplikacji, ale nowa wtyczka (również przykład) pozostaje wyłączona.',
            'Kliknięcie ikony zasilania pokazuje permissions, wzorce network.allow, hooki i zadeklarowane warianty visual. Kod uruchomi się dopiero po zatwierdzeniu.',
            'Zgoda obejmuje zadeklarowane możliwości oraz sam plik z kodem wtyczki. Zmiana uprawnień, sieci, hooków, wariantów albo kodu wymaga ponownego zatwierdzenia.',
            'Wtyczki włączone przed wprowadzeniem zapisu zgody wymagają jednorazowego zatwierdzenia po aktualizacji.',
            'Ikona kosza odinstalowuje wtyczkę i usuwa jej storage oraz konfigurację.',
            'Odśwież ładuje ponownie wtyczki po edycji plików; jeśli zmienił się kod lub zakres capabilities, wtyczka pozostanie wyłączona do ponownego zatwierdzenia.',
            'Wtyczki z polem settings w manifeście mają na karcie formularz konfiguracji.'
          ]
        },
        {
          heading: 'Anatomia workera i sandbox',
          body: 'Wtyczka to osobny web worker, a nie fragment interfejsu. Poniżej pełna ścieżka od instalacji do wyłączenia.',
          list: [
            'Instalacja kopiuje pliki do katalogu danych aplikacji; wtyczka startuje wyłączona i z zapisanym skrótem (SHA-256) pliku entry oraz zestawem możliwości.',
            'Użytkownik klika ikonę zasilania, widzi uprawnienia i zatwierdza. Dopiero wtedy aplikacja uruchamia workera i wstrzykuje shim.',
            'Shim blokuje w workerze bezpośrednie fetch, XMLHttpRequest, WebSocket, EventSource, importScripts, indexedDB i caches — sieć jest dostępna wyłącznie przez api.fetch.',
            'Hooki są dostarczane tylko wtedy, gdy nazwa zgadza się z wpisem w manifest.hooks; payloady z hooków, których nie zadeklarowano, nigdy nie docierają do workera.',
            'Aplikacja odpytuje workera co 15 s (heartbeat). Brak odpowiedzi w ciągu 10 s oznacza worker-heartbeat-timeout i wyłączenie wtyczki, więc zawieszony kod nie zostawia procesu w tle.',
            'Wyłączenie wtyczki zatrzymuje workera, wyrejestrowuje komendy i czyści jej zmiany w UI (dekoracje, sloty). Storage i konfiguracja zostają, bo należą do katalogu wtyczki.',
            'Odinstalowanie usuwa katalog wtyczki wraz ze storage, konfiguracją i plikami danych.',
            'Odpytania api są asynchroniczne i mają 45 s limitu; payload większy niż 100 000 bajtów JSON jest odrzucany zanim wyjdzie z workera.'
          ]
        },
        {
          heading: 'Manifest (manifest.json)',
          body: 'Przykładowy manifest.json:',
          code: `«{
  "name": "Wtyczka przykładowa",
  "version": "1.0.0",
  "description": "Wtyczka demonstracyjna",
  "author": "Autor",
  "entry": "index.js",
  "apiVersion": "1",
  "permissions": {
    "storage": true,
    "notifications": true
  },
  "hooks": ["app:start", "track:play"]
}»`,
          list: [
            'name — nazwa wyświetlana; version, description, author — metadane',
            'entry — plik startowy (domyślnie index.js)',
            'apiVersion — wersja API wtyczek (obecnie 1)',
            'permissions — storage, network.allow (tablica wzorców URL), notifications, player, visual',
            'hooks — hooki, na które wtyczka subskrybuje',
            'settings — opcjonalna lista pól konfiguracji (key, label, type: text|boolean|number, default; dla number też min/max)',
            'layoutElements — opcjonalna lista własnych wariantów layoutu (element, variant, label); wymaga uprawnienia visual (opis poniżej)',
            'uiSlots — opcjonalna lista slotów UI, do których wtyczka może pisać przez api.ui (obecnie audio-view); wymaga uprawnienia visual i jest objęta zgodą',
            'Pole id w manifeście jest ignorowane — identyfikatorem wtyczki jest nazwa katalogu'
          ]
        },
        {
          heading: 'Uprawnienia: co działa bez dodatkowej zgody',
          body: 'Odczytowe zapytania są dostępne każdej wtyczce, ale każda powierzchnia, która może coś zmienić albo zobaczyć więcej niż stan odtwarzacza, jest za gatunkiem. Poniżej pełna mapa:',
          list: [
            'Bez uprawnień: player:status, player:progress, library:count, library:search, odczyt storage i settings (klucze spoza manifestu nie są udostępniane).',
            'player — akcje player:play/pause/toggle/next/previous, player:setVolume, player:seek, player:enqueue oraz track:toggleFavorite.',
            'storage — zapis i usuwanie danych wtyczki (api.storage.set/remove).',
            'notifications — api.notify i powiadomienia przez komendy.',
            'network — każde api.fetch; dodatkowo musi pasować do co najmniej jednego wzorca permissions.network.allow.',
            'visual — dekoracje layoutu (api.visual), sloty UI (api.ui.set/clear) oraz zapytanie player:spectrum.',
            'Deklaracja w manifeście sama w sobie niczego nie włącza: dopóki użytkownik nie zatwierdzi, worker nie startuje, a wyłączenie cofa uprawnienia natychmiast.'
          ]
        },
        {
          heading: 'Hooki',
          body: 'Subskrypcję ustawia się przez api.on(nazwa, handler). Ta sama nazwa musi być wymieniona w hooks w manifeście.',
          list: [
            'app:start — worker wtyczki wystartował; payload nie zawiera dodatkowych danych',
            'track:play — zmieniono utwór; payload: title, artist, album, duration, path',
            'track:timeupdate — pozycja odtwarzacza; wysyłany maksymalnie raz na sekundę; payload: position, duration, progress, rate, playing, track',
            'track:end — utwór się zakończył; payload bieżącego utworu',
            'track:queued — dodano utwór do kolejki; payload jak track:play',
            'library:scan — zakończono skanowanie biblioteki; payload: count',
            'download:start / download:complete / download:error — zmiana stanu pobierania i dane zadania'
          ]
        },
        {
          heading: 'API',
          body: 'Obiekt api jest globalny wewnątrz workera i zawiera:',
          list: [
            'on(nazwa, fn) / off(nazwa) — subskrypcja hooków',
            'query(nazwa, args) — zapytanie do aplikacji (zwraca Promise)',
            'action(nazwa, args) — akcja zmieniająca stan (zwraca Promise)',
            'notify(opts) — powiadomienie w UI',
            'storage.keys() / get(klucz) / set(klucz, wartość) / remove(klucz) — dane wtyczki',
            'settings.get(klucz) / set(klucz, wartość) — konfiguracja wtyczki (wspólna z formularzem na karcie wtyczki); set nie jest dozwolone dla wtyczek bez pola settings w manifeście',
            'fetch(url, opts) — sieć przez proxy procesu głównego',
            'registerCommand(cmd) — komenda w palecie (zwraca funkcję odrejestrującą)',
            'visual(klucz, pole) — dekoracja elementu widoku audio (zwraca Promise)',
            'ui.set(slot, pozycje) / ui.clear(slot) — tekstowy slot UI renderowany przez hosta (uprawnienie visual + slot w uiSlots w manifeście)',
            'log.info / warn / error(wiadomość) — wpisy w zakładce Logi'
          ]
        },
        {
          heading: 'Zapytania',
          body: 'Wywołania query():',
          code: `api.query('player:progress').then(function (p) {
  // position, duration, progress, rate, playing, track
  api.log.info(p.position + ' / ' + p.duration);
});

api.query('player:spectrum', { bins: 32 }).then(function (s) {
  // s.bins — koszyki 0..1, s.available mówi, czy jest AnalyserNode
  api.log.info('poziom: ' + (s.bins[0] || 0).toFixed(2));
});`,
          list: [
            'player:status — stan odtwarzacza (currentTrack, isPlaying, volume, shuffle, repeat, queueLength)',
            'player:progress — bieżąca pozycja (position, duration, progress, rate, playing, track)',
            'player:spectrum — znormalizowane widmo 0..1 w «bins» koszykach (4–64, domyślnie 32); wymaga uprawnienia visual',
            'library:count — liczba utworów, plików audio i playlist',
            'library:search — wyniki dla «query» (opcjonalnie ograniczone przez «limit»)'
          ]
        },
        {
          heading: 'Akcje',
          body: 'Wywołania action(). Akcje odtwarzacza wymagają uprawnienia player (poza notify):',
          code2: `// Wzorzec płynnego wyciszania (jak w przykładzie auto-fade)
var from = null;
api.on('track:timeupdate', function (payload) {
  var left = payload.duration - payload.position;
  if (left > 8) return;
  if (from === null) {
    api.query('player:status').then(function (s) { from = s.volume; });
    return;
  }
  api.action('player:setVolume', { volume: from * Math.max(0, left / 8) });
});

api.on('track:play', function () {
  if (from !== null) api.action('player:setVolume', { volume: from });
  from = null;
});`,
          list: [
            'player:play / player:pause / player:toggle — sterowanie odtwarzaniem',
            'player:next / player:previous — zmiana utworu',
            'player:setVolume — «volume» od 0 do 1',
            'player:seek — «seconds»: przeskok do wskazanej sekundy',
            'player:enqueue — «tracks»: tablica ścieżek utworów z biblioteki dodawana do kolejki',
            'notify — «type»: info, success, warning, error; «title»; «message»',
            'track:toggleFavorite — «path»: przełącza utwór w ulubionych (uprawnienie player)'
          ]
        },
        {
          heading: 'Pamięć (storage)',
          body: 'Każda wtyczka ma prywatny, trwały storage (przetrwa restart). Klucze: litery, cyfry oraz - _ . , maksymalnie 64 znaki; do 100 kluczy i 256 KiB danych.',
          list: [
            'api.storage.keys() — lista kluczy',
            'api.storage.get(klucz) — wartość lub null',
            'api.storage.set(klucz, wartość) — zapis (wartość musi dać się zserializować do JSON)',
            'api.storage.remove(klucz) — usunięcie klucza'
          ]
        },
        {
          heading: 'Konfiguracja (settings)',
          body: 'Pola zdefiniowane w settings w manifeście pojawiają się jako formularz na karcie wtyczki. Wartości są trwałe, a do odczytu/zapisu służy api.settings. Main sprawdza typ i zakres przy zapisie; przy odczycie wartości niezgodne z bieżącym manifestem wracają do poprawnego default lub są pomijane. Klucze spoza manifestu nie są udostępniane.',
          code: `«"settings": [
  { "key": "shape", "label": "Domyślny kształt", "type": "text", "default": "triangle" },
  { "key": "volume", "label": "Głośność", "type": "number", "min": 0, "max": 100 },
  { "key": "notify", "label": "Powiadomienia", "type": "boolean", "default": true }
]»`,
          list: [
            'type — text, boolean albo number; text ma limit 4096 bajtów UTF-8, boolean przyjmuje tylko true/false, a number musi być skończony i w min/max',
            'default — wartość domyślna widoczna też przez api.settings.get(klucz)',
            'api.settings.get(klucz) — wartość lub null',
            'api.settings.set(klucz, wartość) — zapis nowej wartości zgodnej z typem i min/max; limit text to 4096 bajtów UTF-8',
            'Zapisane wartości niezgodne ze zmienionym schematem są ignorowane; poprawny default jest używany zamiast nich'
          ]
        },
        {
          heading: 'Sieć',
          body: 'api.fetch(url, opts) działa przez proxy w procesie głównym. URL musi pasować do permissions.network.allow; hosty rozwiązywane do sieci prywatnej są blokowane, a każde przekierowanie jest ponownie sprawdzane.',
          code: `«{
  "permissions": {
    "network": { "allow": ["https://httpbin.org/*"] }
  }
}»`,
          list: [
            'Opcje: «method», «headers», «body», «timeoutMs», «responseType»: "json" lub "text"',
            'Maksymalnie 5 przekierowań; wzorce URL obsługują znak «*»',
            'Przy przekierowaniu do innej domeny nagłówki wtyczki nie są przekazywane; przekierowania cross-origin dla POST/PUT/PATCH/DELETE są odrzucane'
          ]
        },
        {
          heading: 'Paleta poleceń',
          body: 'registerCommand({ id, label, icon, location, shortcut, action }):',
          list: [
            'id — unikalny identyfikator komendy (zalecany prefiks nazwą wtyczki, np. hello:greet)',
            'label — etykieta pokazywana na karcie i w palecie',
            'icon — opcjonalna nazwa ikony rozumiana przez aplikację (np. Triangle, Circle)',
            'location — opcjonalne miejsce w UI aplikacji, w którym dodać przycisk; obecnie audio-view (pasek narzędzi widoku audio)',
            'shortcut — opcjonalny globalny skrót klawiszowy w formacie "Ctrl+Shift+K", "Alt+F5" itp.; wymaga co najmniej jednego modyfikatora (Ctrl/Meta/Alt/Shift)',
            'Nieprawidłowe lub kolidujące skróty są odrzucane z ostrzeżeniem w Logach; skrót uruchamia komendę globalnie, gdy nie jest edytowany tekst',
            'action — funkcja wywołana po uruchomieniu komendy (wykonywana w workerze); może zwracać Promise',
            'Komendy są dostępne w palecie poleceń (Ctrl+K), jako przyciski na karcie wtyczki, a przy ustawionym location także jako przycisk w pasku aplikacji'
          ]
        },
        {
          heading: 'Menu kontekstowe utworu',
          body: 'Komenda z location "track-menu" pojawia się w menu kontekstowym utworu (prawy przycisk myszy w bibliotece). Inwokowana z kontekstem utworu:',
          list: [
            'registerCommand({ id, label, location: "track-menu", action }) — action otrzymuje obiekt { id, path, title, artist?, album?, duration?, isOnline } opisujący utwór',
            'Menu kontekstowe utworu zawiera standardowe akcje (odtwórz, ulubione, do kolejki itd.) oraz na końcu pozycje dodane przez wtyczki z location: "track-menu"',
            'Kontekst jest migawką (snapshot) utworu — odzwierciedla stan w momencie otwarcia menu',
            'Przykład: api.registerCommand({ id: "hygge:rate", label: "Oceń 5/5", location: "track-menu", action: function (ctx) { ... } })'
          ]
        },
        {
          heading: 'Wygląd (visual)',
          body: 'Wymaga uprawnienia visual. Nadaje dekoracje elementom widoku audio (klucz element.decoration). Dekoracje pochodzą wyłącznie z wtyczek — aplikacja nie ma wbudowanych kształtów ani stylów:',
          list: [
            'Dozwolone elementy: cover, visualization, progress, trackInfo, controls',
            'Wartość to "none" (czyści dekorację) albo "plugin:<element>:<wariant>" — wariant musi być zadeklarowany w manifeście tej wtyczki (layoutElements) i zaimplementowany przez host',
            'Host implementuje obecnie warianty okładki: triangle, circle, diamond, hexagon, flip-x',
            'Przykład: api.visual("element.decoration", { element: "cover", value: "plugin:cover:triangle" }) — okładka zostaje przycięta do trójkąta',
            'Dekoracja okładki (cover) działa też poza widokiem audio: na ekranie „Teraz odtwarzane" oraz w pasku odtwarzacza/okładkach w innych elementach UI',
            'Dekoracje ustawione przez wtyczkę działają globalnie w widoku audio; wybór w edytorze layoutu (zakładka Wariant → Dekoracja) zapisuje preferencję na czas gdy wtyczka nie nadpisuje'
          ]
        },
        {
          heading: 'Własne warianty layoutu (layoutElements)',
          body: 'Wtyczka może dodać nowe opcje dekoracji dla istniejących elementów layoutu. Deklaruje się je w manifeście (wymaga uprawnienia permissions.visual). Każdy wpis to obiekt { element, variant, label? }:',
          code: `«{
  "name": "Moja wtyczka",
  "version": "1.0.0",
  "permissions": { "visual": true },
  "layoutElements": [
    { "element": "cover", "variant": "flip-x", "label": "Odwróć w poziomie" }
  ]
}»`,
          list: [
            'element — jeden z elementów widoku audio: cover, visualization, progress, trackInfo, controls',
            'variant — identyfikator zgodny z ^[a-z][a-z0-9-]{0,40}$ (małe litery, cyfry, myślniki)',
            'label — opcjonalna nazwa wyświetlana w edytorze layoutu zamiast identyfikatora',
            'Wariant pojawia się w edytorze (widok audio → edytor layoutu → zakładka Dekoracja) tylko gdy wtyczka jest aktywna; jest opisany nazwą wtyczki',
            'Wariant musi być zaimplementowany przez host — warianty nieznane aplikacji nie zmieniają wyglądu (bezpieczny fallback) i nie można ich ustawić z kodu',
            'Ustawienie wariantu z kodu: api.visual("element.decoration", { element: "cover", value: "plugin:cover:flip-x" }) — wartość ma zawsze postać plugin:<element>:<variant>',
            'Wariant musi być zadeklarowany w manifeście tej wtyczki i zaimplementowany przez host — inne wartości kończą się błędem „unknown-decoration"',
            'Wartość zapisuje się jak wbudowaną dekorację; wybór jest też widoczny w edytorze layoutu'
          ]
        },
        {
          heading: 'Sloty UI (uiSlots)',
          body: 'Wtyczka nie renderuje własnego HTML ani nie ma dostępu do DOM. Zamiast tego może pisać krótkie pary tekstu do slotu, który rysuje host (obecnie «audio-view» — pasek nad widokiem odtwarzacza). Wymaga uprawnienia visual i deklaracji slotu w manifeście:',
          code: `«{
  "name": "Moja wtyczka",
  "version": "1.0.0",
  "permissions": { "visual": true },
  "uiSlots": ["audio-view"]
}»`,
          code2: `api.ui.set('audio-view', [
  { label: 'Czas', value: '01:24 / 03:40' },
  { label: 'Plik', value: 'Album — Tytuł' }
]);

// Pusta lista czyści slot:
api.ui.clear('audio-view');`,
          list: [
            'api.ui.set("audio-view", [{ label: "Bitrate", value: "320 kbps" }]) — zapis pozycji slotu',
            'api.ui.clear("audio-view") — wyczyszczenie slotu (także po wyłączeniu wtyczki)',
            'Limit hostowy: maksymalnie 8 pozycji, 48 znaków etykiety i 160 znaków wartości; większa lista jest odrzucana błędem, a nie przycinana',
            'Treść jest renderowana jako tekst (bez HTML). Znaki sterujące są usuwane, a spacje normalizowane do jednej linii',
            'Dodanie slotu do manifestu zmienia zakres zatwierdzenia, więc wtyczka wymaga ponownego zatwierdzenia przez użytkownika'
          ]
        },
        {
          heading: 'Debugowanie',
          body: 'Każda karta wtyczki ma sekcję Logi.',
          code: `api.query('player:progress')
  .then(function (progress) {
    api.log.info('pozycja: ' + progress.position);
  })
  .catch(function (err) {
    // komunikat błędu to kod, np. permission-denied:visual
    api.log.error('nie udało się: ' + err.message);
  });`,
          list: [
            'Sekcja Logi pokazuje wpisy z api.log.* oraz błędy workera. Używaj api.log.* — console.log zostaje w kontekście workera i nigdzie nie trafia.',
            'Każde wywołanie api zwraca Promise, więc błędy obsługuj w catch; niezłapany błąd kończy się komunikatem w logach, ale nie wyłącza wtyczki.',
            'Status: Nowa → Ładowanie → Załadowana; błędy uruchamiania są oznaczane jako Błąd.',
            'Po zmianie plików wtyczki kliknij Odśwież, aby załadować nową wersję. Zmiana kodu unieważnia wcześniejsze zatwierdzenie, więc po refreshu trzeba zatwierdzić ponownie.',
            'Zawieszenie w pętli bez powrotu daje worker-heartbeat-timeout — nie blokuj pętli setTimeout w pętli głównej workera.'
          ]
        },
        {
          heading: 'Minimalna wtyczka krok po kroku',
          body: 'Utwórz katalog hello, a w nim dwa pliki. manifest.json:',
          code: `«{
  "name": "Hello",
  "version": "1.0.0",
  "description": "Moja pierwsza wtyczka",
  "author": "Ja",
  "entry": "index.js",
  "permissions": {
    "notifications": true
  }
}»`,
          code2: `api.log.info('hello załadowany');

api.on('app:start', function () {
  api.log.info('start aplikacji');
});

api.registerCommand({
  id: 'hello:greet',
  label: 'Przywitaj się',
  action: function () {
    return api.notify({ type: 'success', title: 'Cześć!', message: 'To działa.' });
  }
});`,
          list: [
            'Wróć do Ustawień → Wtyczki → Instaluj z folderu i wskaż katalog hello.',
            'Włącz wtyczkę, a następnie sprawdź sekcję Logi oraz przycisk komendy na jej karcie.'
          ]
        },
        {
          heading: 'Rozwiązywanie problemów',
          body: 'Błędy z operacji api wracają jako rejected Promise; tekst błędu to kod, a nie zdanie. Najczęstsze:',
          list: [
            'permission-denied:player / :visual / :storage / :notifications — brakuje uprawnienia w manifeście. Dodaj je i przejdź zatwierdzenie ponownie.',
            'unknown-op / unknown-query / unknown-action — literówka w nazwie operacji. Nazwy są wrażliwe na wielkość liter.',
            'setting-unknown — api.settings.set dla klucza, którego nie ma w settings manifestu.',
            'ui-slot:not-declared — slot nie wymieniony w manifest.uiSlots; ui-slot:unknown-slot — slotu nie ma w aplikacji.',
            'ui-slot:too-many-items — więcej niż 8 pozycji; ui-slot:invalid-item — pozycja nie jest obiektem label/value.',
            'plugin-op-args-too-large — argumenty przekraczają 100 000 bajtów JSON; plugin-op-timeout — host nie odpowiedział w 45 s.',
            'worker-ready-timeout — kod workera rzucił wyjątek przy starcie; worker-heartbeat-timeout — kod blokuje pętlę (np. nieskończona pętla while).',
            'fetch: forbidden — URL nie pasuje do allowlisty; invalid-url — zły adres; redirect-loop — za dużo przekierowań; too-large — odpowiedź przekracza limit; network — problem z siecią lub domeną.',
            'manifest:missing-name / missing-version / bad-entry — brak wymaganego pola lub entry wskazujące poza katalog wtyczki.',
            'Wtyczka znika z listy po Odśwież — katalog został usunięty albo manifest przestał się parsować (plik zostaje na dysku, komunikat jest w logach aplikacji).'
          ]
        },
        {
          heading: 'Limity',
          body: 'Twarde ograniczenia wbudowane w aplikację — warto znać je przed projektowaniem wtyczki:',
          list: [
            'Manifest: 64 KiB; plik entry: 1 MiB; maksymalnie 20 zainstalowanych wtyczek.',
            'Storage: 100 kluczy, łącznie 256 KiB; klucz to 1–64 znaki z [a-zA-Z0-9_.-].',
            'Konfiguracja (settings): tekst do 4096 bajtów UTF-8; liczby ogranicza min/max z manifestu.',
            'Hooki: długość nazwy do 64 znaków; track:timeupdate przychodzi maksymalnie raz na sekundę.',
            'Polecenia: id do 64 znaków, label bez limitu długości w UI, location do 64, shortcut do 32 znaków.',
            'api.fetch: maksymalnie 5 przekierowań, 30 s timeoutu, 10 MiB odpowiedzi (1 MiB dla odpowiedzi tekstowej).',
            'Sloty UI: 8 pozycji, 48 znaków etykiety, 160 znaków wartości; api.log obcina wpis do 2000 znaków.',
            'Wywołanie api: 100 000 bajtów argumentów i 45 s na odpowiedź hosta.'
          ]
        },
        {
          heading: 'Dołączone przykłady',
          body: 'W katalogu resources/plugins-examples aplikacji znajduje się dwanaście gotowych wtyczek — każda instaluje się jednym kliknięciem w sekcji Przykłady i zostaje wyłączona do zatwierdzenia:',
          list: [
            'hello — powiadomienia, odczyt stanu odtwarzacza, licznik w storage i test sieci przez api.fetch (httpbin).',
            'triangle — własne warianty layoutu okładki (plugin:cover:triangle i kolejne) plus komenda w palecie.',
            'progress-slot — bezpieczny slot UI: pozycja odtwarzacza, poziom widma z player:spectrum i nazwa pliku.',
            'sleep-timer — minuterka snu: liczy w tle (przeżywa restart) i ostatnie sekundy wycisza płynnie; komendy w palecie.',
            'auto-fade — samo wyciszanie końcówki każdego utworu, z przywracaniem głośności przy zmianie utworu.',
            'Uwaga do obu: worker ginie razem z wtyczką, więc wyłączenie jej w trakcie wyciszania zostawia głośność na obniżonej wartości — trzeba ją podnieść ręcznie.',
            'vu-meter — żywy wskaźnik poziomu i szczytu w slocie UI, z tempem ataku i wypuszczania jak w VU.',
            'focus-mode — licznik sesji w slocie UI, pauza na koniec i polecenia start / status / koniec.',
            'smart-queue — po zakończeniu utworu dokłada następnego: bez powtórek, preferowany ten sam artysta, tryb losowy.',
            'listen-history — lokalna historia odsłuchań: minuty dzisiaj, top wykonawcy tygodnia, ostatnie utwory (nic nie wychodzi z komputera).',
            'track-actions — własne pozycje w menu kontekstowym utworu (kolejka, ulubione, informacje) i lista „jeszcze później”.',
            'metadata-lookup — sprawdza w MusicBrainz wydanie utworu (rok, album) i pokazuje je w slocie UI; wyniki są cache’owane, sieć wymaga zgody.',
            'note-readout — szacuje dominującą nutę z widma i pokazuje ją w slocie; to przybliżenie z grubej siatki, nie tuner.',
            'Wtyczki z network.allow (hello, metadata-lookup) proszą o dostęp do sieci przy zatwierdzaniu — wzór hosta jest widać w oknie zgody.',
            'Przykłady to najlepsza dokumentacja API: czytaj ich index.js, żeby zobaczyć, jak wywołania łączą się w działający kod.'
          ]
        },
        {
          heading: 'Ograniczenia i bezpieczeństwo',
          list: [
            'Wtyczka nie ma dostępu do DOM, modułów Node ani do okna aplikacji — obowiązuje wyłącznie powyższe API.',
            'Każde żądanie sieciowe przechodzi przez proxy i jest filtrowane przez permissions.network.',
            'Storage jest oddzielny dla każdej wtyczki (per katalog).',
            'Brak uprawnienia zwraca błąd permission-denied; nieznane operacje kończą się błędem.',
            'Wyłączenie lub odinstalowanie wtyczki cofa jej zmiany w UI (np. dekoracje okładki).',
            'Zatwierdzenie jest kryptograficznie związane z plikiem entry: podmiana jednej litery w kodzie unieważnia zgodę i wtyczka wraca do stanu wyłączonej.',
            'Sloty UI i widmo to jedyne miejsca, w których treść wtyczki trafia na ekran; aplikacja renderuje je sama, więc wtyczka nie może wstrzyknąć HTML ani skryptu.',
            'apiVersion jest informacyjne — aplikacja nie odrzuca wtyczki na jego podstawie, ale warto zostawić 1, dopóki API się nie zmieni.'
          ]
        }
      ]
    },
    status: {
      new: 'Nowa',
      loading: 'Ładowanie...',
      loaded: 'Załadowana',
      error: 'Błąd'
    }
  }
};
