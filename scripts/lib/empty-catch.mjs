// Wykrywanie pustych bloków `catch {}` i pustych handlerów `.catch(() => {})`.
// Komentarz wewnątrz bloku jest świadomą decyzją „best-effort, celowo
// zignorowane”, więc nie pasuje do wzorca `{\s*}`. Wydzielone z
// `check-catch.mjs`, bo reguła jest łatwa do rozjechania przy zmianie regexu.

export const EMPTY_BLOCK_CATCH = /catch\s*(\([^)]*\))?\s*\{\s*\}/g;
export const EMPTY_PROMISE_CATCH = /\.catch\(\s*(\([^)]*\))?\s*=>\s*\{\s*\}\s*\)/g;

/**
 * Zwraca puste catche w kolejności występowania: `{ kind, index }`.
 * `kind` to etykieta pokazywana w raporcie guardu.
 */
export function findEmptyCatches(source) {
  const found = [];
  for (const match of source.matchAll(EMPTY_BLOCK_CATCH)) {
    found.push({ kind: 'catch {}', index: match.index ?? 0 });
  }
  for (const match of source.matchAll(EMPTY_PROMISE_CATCH)) {
    found.push({ kind: '.catch(() => {})', index: match.index ?? 0 });
  }
  return found.sort((a, b) => a.index - b.index);
}
