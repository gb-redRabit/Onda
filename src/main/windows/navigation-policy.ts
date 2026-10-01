import { join } from 'path';
import { fileURLToPath } from 'url';
import { isPathInside } from '../path-security';

// Eksportowane dla testów: katalog, w którym żyją własne pliki aplikacji.
export const APP_PATH = join(__dirname, '..');

export interface NavigationPolicyOptions {
  // Zezwól na adresy data: (używane przez okna-zastępcze podglądu PiP).
  allowData?: boolean;
}

export function isAllowedNavigationUrl(
  url: string,
  devUrl: string | undefined,
  options: NavigationPolicyOptions = {}
): boolean {
  try {
    const parsed = new URL(url);
    if (options.allowData && parsed.protocol === 'data:') return true;
    if (parsed.protocol === 'file:') {
      // Tylko pliki dostarczone z aplikacją. Media są serwowane przez http przez
      // media server i konsumowane jako źródła <img>/<audio>/<video> — nigdy jako
      // cel nawigacji — więc nic innego nie może być celem nawigacji. (Wcześniej
      // każdy URL file: był dozwolony, co jest prymitywem odczytu pliku lokalnego.)
      // `fileURLToPath` (a nie path.resolve na pathname) poprawnie obsługuje litery
      // dysków Windows i percent-encoding.
      try {
        return isPathInside(APP_PATH, fileURLToPath(parsed));
      } catch {
        return false;
      }
    }
    if (parsed.protocol === 'onda:') return true;
    if (devUrl) {
      const dev = new URL(devUrl);
      if (parsed.origin === dev.origin) return true;
    }
    return false;
  } catch {
    return false;
  }
}
