// Krótki, unikalny identyfikator dla nazw plików tymczasowych/katalogów cache.
// Wcześniej skopiowany prywatnie w `cover-cache-helpers.ts` i `subtitle-handlers.ts`.
export function uniqueId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
