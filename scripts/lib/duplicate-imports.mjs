// Wykrywanie zduplikowanych importów w jednym pliku. Wydzielone z
// `check-duplicate-imports.mjs`, bo wyrażenie regularne obsługuje importy
// wielolinijkowe, `import type` i importy z efektem ubocznym — łatwo je zepsuć
// przy „drobnej” zmianie, a wtedy guard przestaje cokolwiek łapać.

// `^[ \t]*import` łapie początek instrukcji importu; `(type\s+)?` rozróżnia
// import typu od wartości (osobne kategorie — nie łączymy ich w jeden import);
// `[^'"]*?\bfrom` przeskakuje (także przez nowe linie) do `from`, a gdy go brak —
// dopasowuje import z efektem ubocznym (`import 'x'`).
export const IMPORT_RE = /^[ \t]*import\s+(type\s+)?(?:[^'"]*?\bfrom\s*)?['"]([^'"]+)['"]/gm;

/**
 * Zwraca klucze `<kind> <specifier>`, które występują więcej niż raz.
 * `kind` to `type` albo `value`, więc `import` i `import type` z tego samego
 * źródła nie są traktowane jako duplikat.
 */
export function duplicateSpecifiers(source) {
  const counts = new Map();
  for (const match of source.matchAll(IMPORT_RE)) {
    const kind = match[1] ? 'type' : 'value';
    const key = `${kind} ${match[2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}
