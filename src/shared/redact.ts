// Log + error redaction: masks secrets that would otherwise end up in the
// exported log file, the diagnostics warning buffer, or a stored download error.
// Pure and synchronous so the file logger can apply it to every line.

// Media-server URLs embed a random UUID token as the first path segment.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// `?token=…`, `api_key=…`, `apiKey=…`, `sig=…`, `access_token=…`, `password=…`.
const QUERY_SECRET_RE =
  /([?&](?:token|api[_-]?key|key|sig|signature|auth|access_token|password)=)[^&\s"']+/gi;
// `Authorization: Bearer …` (header or JSON/object field); the optional quote is
// preserved so JSON payloads stay valid.
const AUTH_HEADER_RE = /(authorization["']?\s*[:=]\s*)(["']?)(?:bearer\s+)?[^"',\s}]+/gi;
// `Cookie: …` / `Set-Cookie: …` (header or JSON field).
const COOKIE_HEADER_RE = /((?:set-)?cookie["']?\s*[:=]\s*)(["']?)[^"'\n]+/gi;
// yt-dlp cookie flags: `--cookies <path>`, `--cookies-from-browser <browser>`.
const COOKIES_FLAG_RE = /--cookies(?:-from-browser)?\s+\S+/g;
// Bare `key=value` / `key: value` secrets not preceded by `?`/`&` (CLI output).
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
