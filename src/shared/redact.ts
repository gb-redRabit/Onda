// Redakcja logów i błędów: maskuje sekrety, które inaczej trafiłyby do
// eksportowanego pliku logu, bufora ostrzeżeń diagnostyki lub zapisanego błędu pobierania.
// Czysta i synchroniczna, więc logger plikowy może ją zastosować do każdej linii.

// URL-e serwera mediów zawierają losowy token UUID jako pierwszy segment ścieżki.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// `?token=…`, `api_key=…`, `apiKey=…`, `sig=…`, `access_token=…`, `refresh_token=…`,
// `id_token=…`, `client_secret=…`, `password=…`, `secret=…`.
const QUERY_SECRET_RE =
  /([?&](?:token|api[_-]?key|key|sig|signature|auth|access_token|refresh_token|id_token|client_secret|password|secret)=)[^&\s"']+/gi;
// Dowolny nagłówek `Authorization` — nie tylko `Bearer`. Wcześniej wzorzec znał
// wyłącznie scheme Bearer, więc `Authorization: Basic <base64>` przechodziło z
// zakodowanymi poświadczeniami. Maskuje całą wartość po dwukropku/znaku równości,
// zachowując otwierający cudzysłów, aby payloady JSON pozostały poprawne.
const AUTH_HEADER_RE = /(authorization["']?\s*[:=]\s*)(["']?)[^"',\n}]+/gi;
// `Cookie: …` / `Set-Cookie: …` (nagłówek lub pole JSON).
const COOKIE_HEADER_RE = /((?:set-)?cookie["']?\s*[:=]\s*)(["']?)[^"'\n]+/gi;
// Flagi cookie yt-dlp: `--cookies <path>`, `--cookies-from-browser <browser>`.
const COOKIES_FLAG_RE = /--cookies(?:-from-browser)?\s+\S+/g;
// Proxy z poświadczeniami w URL: `--proxy http://user:pass@host:port`.
const PROXY_FLAG_RE = /--proxy(?:-server)?\s+\S+/gi;
// Same sekrety `key=value` / `key: value` niepoprzedzone `?`/`&` (wynik CLI).
const BARE_SECRET_RE =
  /(\b(?:cookie|password|token|auth|authorization|api[_-]?key|x-api-key|access_token|refresh_token|id_token|client_secret|secret)\s*[=:]\s*)([^&\s"',}]+)/gi;

export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(COOKIES_FLAG_RE, '--cookies ***')
    .replace(PROXY_FLAG_RE, '--proxy ***')
    .replace(AUTH_HEADER_RE, (_match, prefix: string, quote: string) => `${prefix}${quote}***`)
    .replace(COOKIE_HEADER_RE, (_match, prefix: string, quote: string) => `${prefix}${quote}***`)
    .replace(QUERY_SECRET_RE, '$1***')
    .replace(BARE_SECRET_RE, '$1***')
    .replace(UUID_RE, '***');
}
