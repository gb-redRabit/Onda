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
  // W buildzie produkcyjnym renderer jest ładowany z pliku, więc origin
  // dev-servera nie ma legalnego zastosowania. `NODE_ENV` jest wstawiane przez
  // Vite (`production` dla builda, `development` w dev), więc zmienna środowiskowa
  // nie może otworzyć CORS w spakowanej aplikacji.
  const devUrl =
    process.env.NODE_ENV === 'production' ? undefined : process.env['ELECTRON_RENDERER_URL'];
  if (!devUrl) return null;
  try {
    return new URL(devUrl).origin === origin ? origin : null;
  } catch {
    return null;
  }
}
