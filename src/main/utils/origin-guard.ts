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
  // W produkcji renderer jest ładowany z pliku, więc origin http://localhost
  // nie ma legalnego zastosowania. W dev dopuszczamy wyłącznie dokładny origin
  // serwera Vite, a nie dowolny port na localhost.
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!devUrl) return null;
  try {
    return new URL(devUrl).origin === origin ? origin : null;
  } catch {
    return null;
  }
}
