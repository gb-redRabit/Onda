import { describe, expect, it } from 'vitest';
import {
  decideRateLimitRetry,
  MB_MAX_RATE_LIMIT_RETRIES,
  MB_MAX_RETRY_DELAY_MS
} from '../musicbrainz-rate-limit';

// The bug this covers: `mbFetch` re-entered itself on every 503 with no attempt
// counter, so an endpoint that kept rate limiting spun forever in the
// background. The policy is pure so the bound is provable without a stub.

describe('decideRateLimitRetry', () => {
  it('retries a 503 a bounded number of times, then stops', () => {
    const attempts: boolean[] = [];
    for (let attempt = 0; attempt < MB_MAX_RATE_LIMIT_RETRIES + 3; attempt++) {
      attempts.push(decideRateLimitRetry(503, attempt, '2') !== null);
    }
    expect(attempts).toEqual([true, true, true, false, false, false]);
  });

  it('counts the attempt so the cap is exactly MB_MAX_RATE_LIMIT_RETRIES retries', () => {
    let retries = 0;
    for (let attempt = 0; ; attempt++) {
      const decision = decideRateLimitRetry(503, attempt, '2');
      if (!decision) break;
      retries++;
      expect(decision.nextAttempt).toBe(attempt + 1);
      if (retries > 10) throw new Error('retry policy did not terminate');
    }
    expect(retries).toBe(MB_MAX_RATE_LIMIT_RETRIES);
  });

  it('honours Retry-After within the cap', () => {
    expect(decideRateLimitRetry(503, 0, '1')?.delayMs).toBe(1000);
    expect(decideRateLimitRetry(503, 0, '3')?.delayMs).toBe(3000);
  });

  it('caps an absurd Retry-After so a request cannot park for hours', () => {
    expect(decideRateLimitRetry(503, 0, '86400')?.delayMs).toBe(MB_MAX_RETRY_DELAY_MS);
  });

  it('falls back to a sane default for a missing or malformed header', () => {
    expect(decideRateLimitRetry(503, 0, undefined)?.delayMs).toBe(2000);
    expect(decideRateLimitRetry(503, 0, 'not-a-number')?.delayMs).toBe(2000);
    expect(decideRateLimitRetry(503, 0, '-5')?.delayMs).toBe(2000);
    expect(decideRateLimitRetry(503, 0, '0')?.delayMs).toBe(2000);
  });

  it('reads the first value of a repeated header', () => {
    expect(decideRateLimitRetry(503, 0, ['2', '99'])?.delayMs).toBe(2000);
  });

  it('does not retry other statuses, so a 404 or 429 surfaces immediately', () => {
    expect(decideRateLimitRetry(404, 0, '2')).toBeNull();
    expect(decideRateLimitRetry(429, 0, '2')).toBeNull();
    expect(decideRateLimitRetry(500, 0, '2')).toBeNull();
    expect(decideRateLimitRetry(200, 0, '2')).toBeNull();
    expect(decideRateLimitRetry(undefined, 0, '2')).toBeNull();
  });
});
