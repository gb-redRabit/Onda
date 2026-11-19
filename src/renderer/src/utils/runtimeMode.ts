// Rozróżnia dwa runtime'y renderera:
//  - Core: prawdziwy właściciel audio (bez UI), `isCoreShell()` = false,
//  - shell: main/compact UI, które tylko odbija stan Core i wysyła komendy.
// Flagę ustawia entry shellu przed montowaniem (main.ts / compact main.ts).
let coreShell = false;

export function setCoreShellMode(value: boolean): void {
  coreShell = value;
}

export function isCoreShell(): boolean {
  return coreShell;
}

/**
 * Okno pomocnicze (Eksplorator, podgląd obrazu, narzędzia) ładuje ten sam SPA,
 * ale nie potrzebuje globalnego bootu aplikacji: pluginów, biblioteki, scrobbling,
 * Discorda ani rozgrzewania audio. Sprawdzamy `location.hash` synchronicznie,
 * bo trasa może nie być jeszcze rozwiązana w chwili startu `main.ts`.
 */
export function isStandaloneWindowRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  return (
    hash.startsWith('#/tools/') ||
    hash.startsWith('#/explorer/window') ||
    hash.startsWith('#/image-viewer')
  );
}
