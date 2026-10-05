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
  const canonical = `${parsed.origin}${parsed.pathname}${parsed.search}`;
  return patterns.some((p) => {
    const re = compileNetworkPattern(p);
    return re ? re.test(canonical) : false;
  });
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
