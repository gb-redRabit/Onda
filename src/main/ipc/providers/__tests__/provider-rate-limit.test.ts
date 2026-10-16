import { describe, it, expect, beforeEach } from 'vitest';
import { throttleProvider, __resetProviderRateLimit } from '../provider-rate-limit';

// Wspólny rate-limiter providerów: min. odstęp między zapytaniami (per provider).

describe('throttleProvider', () => {
  beforeEach(() => __resetProviderRateLimit());

  it('wymusza minimalny odstęp między kolejnymi zapytaniami tego samego providera', async () => {
    const t0 = Date.now();
    await throttleProvider('pikpak');
    await throttleProvider('pikpak');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250); // ~300 ms
  });

  it('nie opóźnia zapytań do innego providera', async () => {
    await throttleProvider('a');
    const t0 = Date.now();
    await throttleProvider('b');
    expect(Date.now() - t0).toBeLessThan(100);
  });

  it('reset czyści stan (kolejne wywołanie nie czeka)', async () => {
    await throttleProvider('x');
    __resetProviderRateLimit();
    const t0 = Date.now();
    await throttleProvider('x');
    expect(Date.now() - t0).toBeLessThan(100);
  });
});
