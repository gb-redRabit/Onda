/**
 * Pomocniki nazw plików współdzielone przez proces główny i renderer. Były
 * wcześniej zduplikowane (w dwóch przypadkach bajt w bajt), więc poprawka w
 * jednej kopii nie docierała do pozostałych — a ich limity/fallbacki już się rozjechały.
 */

export interface SanitizeFilenameOptions {
  maxLength?: number;
  fallback?: string;
}

/**
 * Zastępuje znaki wrogie systemowi plików przez `_`, przycina, usuwa końcowe
 * kropki i spacje oraz ogranicza długość. Używane dla nazw plików pobierania
 * tworzonych z tytułów utworów.
 */
export function sanitizeFilename(input: string, options: SanitizeFilenameOptions = {}): string {
  const { maxLength = 120, fallback = 'track' } = options;
  const cleaned = (input ?? '')
    // eslint-disable-next-line no-control-regex -- znaki sterujące są nieprawidłowe w nazwach plików
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .replace(/[.\s]+$/, '');
  return (cleaned || fallback).slice(0, maxLength);
}

/**
 * Wariant używany przez potok pobierania bezpośredniego: zwija białe znaki wokół
 * wrogich znaków do pojedynczej spacji (utrzymuje czytelność tytułów), zamiast
 * podstawiać podkreślenie.
 */
export function sanitizeFilenameSpaced(
  input: string,
  options: SanitizeFilenameOptions = {}
): string {
  const { maxLength = 180, fallback = 'download' } = options;
  return (
    (input ?? '')
      .replace(/\s*[\\/:*?"<>|]\s*/g, ' ')
      .trim()
      .slice(0, maxLength) || fallback
  );
}
