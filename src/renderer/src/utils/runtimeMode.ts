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
