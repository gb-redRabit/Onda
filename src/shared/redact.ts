// Redakcja logów i błędów: maskuje sekrety, które inaczej trafiłyby do
// eksportowanego pliku logu, bufora ostrzeżeń diagnostyki lub zapisanego błędu pobierania.
// Czysta i synchroniczna, więc logger plikowy może ją zastosować do każdej linii.

// URL-e serwera mediów zawierają losowy token UUID jako pierwszy segment ścieżki.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// `?token=…`, `api_key=…`, `apiKey=…`, `sig=…`, `access_token=…`, `password=…`.
const QUERY_SECRET_RE =
  /([?&](?:token|api[_-]?key|key|sig|signature|auth|access_token|password)=)[^&\s"']+/gi;
// `Authorization: Bearer …` (nagłówek lub pole JSON/obiektu); opcjonalny
// cudzysłów jest zachowany, żeby payloady JSON pozostały poprawne.
const AUTH_HEADER_RE = /(authorization["']?\s*[:=]\s*)(["']?)(?:bearer\s+)?[^"',\s}]+/gi;
// `Cookie: …` / `Set-Cookie: …` (nagłówek lub pole JSON).
const COOKIE_HEADER_RE = /((?:set-)?cookie["']?\s*[:=]\s*)(["']?)[^"'\n]+/gi;
// Flagi cookie yt-dlp: `--cookies <path>`, `--cookies-from-browser <browser>`.
const COOKIES_FLAG_RE = /--cookies(?:-from-browser)?\s+\S+/g;
// Same sekrety `key=value` / `key: value` niepoprzedzone `?`/`&` (wynik CLI).
const BARE_SECRET_RE = /(\b(?:cookie|password|token|auth|authorization)\s*[=:]\s*)([^&\s"',}]+)/gi;

export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(COOKIES_FLAG_RE, '--cookies ***')
    .replace(AUTH_HEADER_RE, (_match, prefix: string, quote: string) => `${prefix}${quote}***`)
    .replace(COOKIE_HEADER_RE, (_match, prefix: string, quote: string) => `${prefix}${quote}***`)
    .replace(QUERY_SECRET_RE, '$1***')
    .replace(BARE_SECRET_RE, '$1***')
    .replace(UUID_RE, '***');
}
