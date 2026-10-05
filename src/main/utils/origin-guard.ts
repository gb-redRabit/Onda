// Wspólny guard pochodzenia dla odpowiedzi procesu głównego (lokalny serwer mediów
// oraz protokół `onda://`). Wcześniej istniały dwie, niemal identyczne kopie, które
// mogły się rozjechać — a rozjazd w polityce CORS to luka bezpieczeństwa.
//
// Chromium wysyła dosłowny string `null` jako Origin dla stron `file://`, więc musi
// przejść; dozwolony jest też lokalny dev-server.
export function allowedAppOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  if (origin === 'null') return origin;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol === 'file:') return origin;
  const isLocalDev =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  return isLocalDev ? origin : null;
}
