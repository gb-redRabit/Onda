// Log redaction (plan 7.3): masks secrets that would otherwise end up in the
// exported log file or the diagnostics warning buffer. Pure and synchronous so
// the file logger can apply it to every line.

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

export function redactSecrets(text: string): string {
  if (!text) return text;
  return text
    .replace(QUERY_SECRET_RE, '$1***')
    .replace(AUTH_HEADER_RE, (_match, prefix: string, quote: string) => `${prefix}${quote}***`)
    .replace(COOKIE_HEADER_RE, (_match, prefix: string, quote: string) => `${prefix}${quote}***`)
    .replace(UUID_RE, '***');
}
