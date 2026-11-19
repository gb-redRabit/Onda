import { app } from 'electron';
import { isWithinRoot } from '../path-policy';

/**
 * Katalog danych aplikacji albo `null`, gdy Electron nie jest dostępny
 * (np. testy jednostkowe bez zamockowanego `app`).
 */
export function userDataRoot(): string | null {
  try {
    const root = app?.getPath?.('userData');
    return typeof root === 'string' && root ? root : null;
  } catch {
    return null;
  }
}

/**
 * True dla ścieżek w katalogu danych aplikacji. Renderer nie może tam pisać ani
 * usuwać: `userData/bin` to binarki uruchamiane przez main, `userData/plugins`
 * to kod pluginów, a pliki stanu i klucze są zarządzane wyłącznie wewnętrznie.
 * Wewnętrzne moduły main nie przechodzą przez te guardy.
 */
export function isProtectedAppDataPath(target: unknown): boolean {
  const root = userDataRoot();
  return !!root && isWithinRoot(target, root);
}
