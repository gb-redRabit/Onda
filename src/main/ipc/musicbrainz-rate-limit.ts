/**
 * Polityka ponawiania dla rate limitingu MusicBrainz.
 *
 * MusicBrainz odpowiada na zdławione żądanie kodem 503 + Retry-After. Ponawianie jest
 * poprawne, ale musi być OGRANICZONE: endpoint, który ciągle zwraca
 * 503, musi ujawnić się jako błąd, a nie wracać do fetch w nieskończoność
 * w tle, gdy aplikacja wydaje się bezczynna.
 *
 * Trzymana czysta i oddzielona od transportu, aby politykę można było testować bez
 * stubu sieciowego.
 */

export const MB_MAX_RATE_LIMIT_RETRIES = 3;
export const MB_MAX_RETRY_DELAY_MS = 5000;
const DEFAULT_RETRY_AFTER_SECONDS = 2;

export interface RateLimitDecision {
  retry: boolean;
  delayMs: number;
  /** Numer próby, który wywołujący powinien przekazać do następnego żądania. */
  nextAttempt: number;
}

export function decideRateLimitRetry(
  statusCode: number | undefined,
  attempt: number,
  retryAfterHeader: string | string[] | undefined
): RateLimitDecision | null {
  // 429 to wyraźna odpowiedź "zwolnij"; wywołujący ujawnia ją, zamiast
  // ponawiać, ponieważ MusicBrainz banuje za długotrwały nacisk.
  if (statusCode !== 503) return null;
  if (attempt >= MB_MAX_RATE_LIMIT_RETRIES) return null;

  const header = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
  const seconds = Number(header ?? DEFAULT_RETRY_AFTER_SECONDS);
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_AFTER_SECONDS;
  return {
    retry: true,
    delayMs: Math.min(safeSeconds * 1000, MB_MAX_RETRY_DELAY_MS),
    nextAttempt: attempt + 1
  };
}
