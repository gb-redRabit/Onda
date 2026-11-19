// Czyste helpery guardów przechowywania / sieci pluginów wyodrębnione z `plugins-core.ts`
// (plan 2.8). `plugins-core` re-eksportuje je, aby importery i testy pozostały
// bez zmian.
import type { PluginPermissions } from '../../../shared/types/ipc';
import { MAX_PLUGIN_SETTING_TEXT_BYTES } from '../../../shared/plugin-settings';
import { safeAssign } from '../settings/settings-sanitizers';
export { pluginSettingValueValid } from '../../../shared/plugin-settings';

export const STORAGE_KEY_RE = /^[a-zA-Z0-9_.\-]{1,64}$/;
export const MAX_STRING_VALUE_BYTES = MAX_PLUGIN_SETTING_TEXT_BYTES;

// Sprawdzanie uprawnień (plan 7.1): manifest decyduje, z których operacji mostu
// plugin może korzystać. Fetch sprawdza allowlistę sieciową w handlerze; storage i
// ustawienia przechodzą przez te helpery.
export function storagePermissionGranted(permissions: PluginPermissions): boolean {
  return permissions.storage === true;
}

// Plugin bez uprawnienia storage może zapisywać tylko ustawienia jawnie
// zadeklarowane w manifeście — inaczej ustawienia byłyby nieograniczonymi tylnymi
// drzwiami obok limitu storage i samego uprawnienia storage.
export function settingWriteAllowed(
  permissions: PluginPermissions,
  declaredKeys: readonly string[] | undefined,
  key: string
): boolean {
  if (permissions.storage === true) return true;
  return (declaredKeys ?? []).includes(key);
}

export function validStorageKey(key: unknown): key is string {
  return typeof key === 'string' && STORAGE_KEY_RE.test(key);
}

export function storageSizeBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function sanitizeStoredObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!validStorageKey(key)) continue;
    if (storageSizeBytes(value) > MAX_STRING_VALUE_BYTES) continue;
    // `__proto__` przechodzi STORAGE_KEY_RE, a przypisanie `out[key] = value`
    // ustawiłoby prototyp zamiast własnej właściwości.
    safeAssign(out, key, value);
  }
  return out;
}

// Kompilacja wzorca jest deterministyczna i wołana przy każdym żądaniu pluginu
// oraz przy każdym przekierowaniu, więc wynik trzymamy w cache zamiast składać
// RegExp za każdym razem.
//
// Kluczem cache jest sam wzorzec (nie testowany URL), a wzorce pochodzą z
// `permissions.network.allow` manifestu. Manifest jest ograniczony do 64 KiB i
// 20 pluginów, ale liczba pozycji `allow` nie jest limitowana — bez górnego
// rozmiaru cache mógłby urosnąć do setek tysięcy skompilowanych RegExpów
// (amplifikacja pamięci sterowana przez autora pluginu). Utrzymujemy więc
// twardy limit, wyrzucając najstarszy wpis (Map trzyma kolejność wstawiania).
export const MAX_PATTERN_CACHE_SIZE = 1000;
const compiledPatternCache = new Map<string, RegExp | null>();

/** Rozmiar cache wzorców — diagnostyka i testy granicy pamięci. */
export function compiledNetworkPatternCacheSize(): number {
  return compiledPatternCache.size;
}

export function compileNetworkPattern(pattern: string): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 500) return null;
  const cached = compiledPatternCache.get(pattern);
  if (cached !== undefined) return cached;
  if (compiledPatternCache.size >= MAX_PATTERN_CACHE_SIZE) {
    const oldest = compiledPatternCache.keys().next().value;
    if (oldest !== undefined) compiledPatternCache.delete(oldest);
  }
  const compiled = buildNetworkPattern(pattern);
  compiledPatternCache.set(pattern, compiled);
  return compiled;
}

function buildNetworkPattern(pattern: string): RegExp | null {
  const match = pattern.match(/^(https?:\/\/)([^/?#]+)(.*)$/);
  if (!match) return null;
  const [, proto, hostPattern, pathPattern] = match;

  // W hoście gwiazdka dopasowuje wyłącznie etykiety hosta (bez ukośnika, dwukropka, zapytania)
  const escapedHost = hostPattern
    .split('*')
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/:?#]+');

  // W ścieżce gwiazdka może dopasować dowolne znaki
  const escapedPath = pathPattern
    .split('*')
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  // Bez granicy wzorzec taki jak `https://api.example.com` pasowałby też do
  // `https://api.example.com.evil` (host-confusion). Wzorzec kończący się jawnym
  // `*` zachowuje zamierzone działanie prefiksu.
  const boundary = pattern.endsWith('*') ? '' : '(?=[/:?#]|$)';
  try {
    return new RegExp(
      `^${proto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${escapedHost}${escapedPath}${boundary}`
    );
  } catch {
    return null;
  }
}

export function urlAllowed(url: string, patterns: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  // Dane uwierzytelniające w URL oszukują dopasowanie hosta
  // (`https://allowed.example.com@evil.example/`) — odrzucamy.
  if (parsed.username || parsed.password) return false;

  // Dopasowujemy na ZNORMALIZOWANYM URL-u, nie na surowym wejściu. Parser WHATWG
  // zamienia `\` na `/` w autorytecie, więc regex na surowym stringu widział inny
  // host niż ten, z którym połączy się transport (`https://evil.com\.example.com/x`).
  return patterns.some((p) => networkPatternMatches(p, parsed));
}

/**
 * Dopasowanie wzorca manifestu bez RegExp. Wzorce pochodzą od autora pluginu;
 * `.*`/`[^/:?#]+` skompilowane do regexu pozwalały na wykładniczy backtracking
 * na wątku głównym (ReDoS). Algorytm gwiazdki jest liniowy (z cofaniem tylko do
 * ostatniej `*`) i nie może się zapętlić.
 */
function globMatch(pattern: string, text: string, canConsume: (ch: string) => boolean): boolean {
  let p = 0;
  let t = 0;
  let star = -1;
  let consumed = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === text[t]) {
      p += 1;
      t += 1;
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p;
      p += 1;
      consumed = t;
    } else if (star !== -1 && consumed < text.length && canConsume(text[consumed])) {
      consumed += 1;
      t = consumed;
      p = star + 1;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === '*') p += 1;
  return p === pattern.length;
}

function pathPatternMatches(pattern: string, text: string): boolean {
  // Wzorzec zakończony `*` jest prefiksem obejmującym resztę ścieżki.
  if (pattern.endsWith('*')) return globMatch(pattern, text, () => true);
  // Bez końcowej gwiazdki dopasowanie kończy się na granicy segmentu/parametrów.
  for (let i = 0; i <= text.length; i += 1) {
    if (i < text.length && !'/:?#'.includes(text[i])) continue;
    if (globMatch(pattern, text.slice(0, i), () => true)) return true;
  }
  return false;
}

function networkPatternMatches(pattern: string, parsed: URL): boolean {
  const match = /^(https?:\/\/)([^/?#]+)(.*)$/.exec(pattern);
  if (!match) return false;
  const [, proto, hostPattern, pathPattern] = match;
  if (`${parsed.protocol}//` !== proto) return false;
  // Gwiazdka w hoście nie przechodzi przez separator portu (`:`), jak wcześniej
  // `[^/:?#]+`; kropki i myślniki są dozwolone.
  if (!hostPatternMatches(hostPattern, parsed.host)) return false;
  return pathPatternMatches(pathPattern, `${parsed.pathname}${parsed.search}`);
}

function hostPatternMatches(pattern: string, host: string): boolean {
  // Wzorzec bez końcowej gwiazdki pasuje do hosta także wtedy, gdy URL ma port:
  // granica hosta to `:` albo koniec. Dzięki temu `api.example.com` nie pasuje
  // do `api.example.com.evil`, ale pasuje do `api.example.com:8443`.
  if (pattern.endsWith('*')) return globMatch(pattern, host, (ch) => ch !== ':');
  for (let i = 0; i <= host.length; i += 1) {
    if (i < host.length && host[i] !== ':') continue;
    if (globMatch(pattern, host.slice(0, i), (ch) => ch !== ':')) return true;
  }
  return false;
}

export function resolveRedirectUrl(baseUrl: string, location: string): string | null {
  try {
    const u = new URL(location, baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}
