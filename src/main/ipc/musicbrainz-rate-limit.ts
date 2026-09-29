/**
 * Retry policy for MusicBrainz rate limiting.
 *
 * MusicBrainz answers a throttled request with 503 + Retry-After. Retrying is
 * correct, but the retry has to be BOUNDED: an endpoint that keeps returning
 * 503 must surface as an error, not re-enter the fetch forever in the
 * background while the app appears idle.
 *
 * Kept pure and separate from the transport so the policy is testable without
 * a network stub.
 */

export const MB_MAX_RATE_LIMIT_RETRIES = 3;
export const MB_MAX_RETRY_DELAY_MS = 5000;
const DEFAULT_RETRY_AFTER_SECONDS = 2;

export interface RateLimitDecision {
  retry: boolean;
  delayMs: number;
  /** The attempt number the caller should pass to the next request. */
  nextAttempt: number;
}

export function decideRateLimitRetry(
  statusCode: number | undefined,
  attempt: number,
  retryAfterHeader: string | string[] | undefined
): RateLimitDecision | null {
  // 429 is the explicit "slow down" answer; the caller surfaces it rather than
  // retrying, because MusicBrainz bans on sustained pressure.
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
