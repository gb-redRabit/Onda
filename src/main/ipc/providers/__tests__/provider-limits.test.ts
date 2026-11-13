import { describe, it, expect } from 'vitest';
import { detectProviderLimit, formatProviderLimit } from '../provider-limits';
import { classifyYtDlpError, describeError } from '../../../downloads/error-classifier';

// Uniwersalna detekcja limitów serwisów (transfer/kwota/rate-limit).

describe('detectProviderLimit', () => {
  it('wykrywa limit MEGA wraz z czasem resetu', () => {
    expect(detectProviderLimit('Bandwidth limit reached: 2307 seconds until it resets')).toEqual({
      limited: true,
      retryAfterSeconds: 2307,
      source: 'MEGA'
    });
  });

  it('wykrywa ogólne sformułowania (429 / quota / rate limit)', () => {
    expect(detectProviderLimit('HTTP 429 Too Many Requests').limited).toBe(true);
    expect(detectProviderLimit('transfer quota exceeded, try again later').limited).toBe(true);
    expect(detectProviderLimit('rate limit — try again in 5 minutes')).toMatchObject({
      limited: true,
      retryAfterSeconds: 300
    });
  });

  it('zwraca brak limitu dla zwykłych błędów', () => {
    expect(detectProviderLimit('HTTP 404 not found')).toEqual({ limited: false });
    expect(detectProviderLimit('')).toEqual({ limited: false });
    expect(formatProviderLimit({ limited: false })).toBe('');
  });

  it('wyciąga sekundy, minuty i godziny z komunikatu', () => {
    expect(detectProviderLimit('rate limit: 30 seconds')).toMatchObject({
      limited: true,
      retryAfterSeconds: 30
    });
    expect(detectProviderLimit('too many requests, retry in 2 hours')).toMatchObject({
      limited: true,
      retryAfterSeconds: 7200
    });
  });

  it('formatuje opis limitu dla UI', () => {
    expect(formatProviderLimit({ limited: true, retryAfterSeconds: 90, source: 'MEGA' })).toBe(
      'Service limit (MEGA) — try again in ~2 min'
    );
    expect(formatProviderLimit({ limited: true, source: 'quota' })).toBe(
      'Service limit (quota) — try again later'
    );
    expect(formatProviderLimit({ limited: true })).toBe('Service limit — try again later');
  });
});

describe('classifyYtDlpError', () => {
  it('mapuje limit serwisu na rate-limited (ale 429 YouTube zostaje bot-block)', () => {
    expect(classifyYtDlpError('Bandwidth limit reached: 2307 seconds until it resets')).toBe(
      'rate-limited'
    );
    expect(classifyYtDlpError('ERROR: HTTP Error 429: Too Many Requests')).toBe('bot-block');
  });

  it('klasyfikuje limity bez wzorca bota jako rate-limited', () => {
    expect(classifyYtDlpError('transfer quota exceeded')).toBe('rate-limited');
    expect(classifyYtDlpError('out of quota')).toBe('rate-limited');
  });

  it('mapuje gołe statusy HTTP na kategorie przejściowe', () => {
    expect(classifyYtDlpError('HTTP 408')).toBe('network');
    expect(classifyYtDlpError('HTTP 429')).toBe('rate-limited');
    expect(classifyYtDlpError('HTTP 500')).toBe('network');
    expect(classifyYtDlpError('HTTP 503')).toBe('network');
    expect(classifyYtDlpError('HTTP 404')).toBe('not-found');
    expect(classifyYtDlpError('HTTP 410')).toBe('not-found');
    expect(classifyYtDlpError('HTTP 418')).toBe('unknown');
  });
});

describe('describeError', () => {
  it('zwraca stabilny opis dla każdego kodu i domyślny fallback', () => {
    expect(describeError('auth-required')).toContain('Sign-in required');
    expect(describeError('bot-block')).toContain('bot protection');
    expect(describeError('private')).toContain('private');
    expect(describeError('not-found')).toContain('not found');
    expect(describeError('network')).toContain('Network error');
    expect(describeError('proxy')).toContain('Proxy error');
    expect(describeError('dependency')).toContain('Missing dependency');
    expect(describeError('disk-full')).toContain('disk space');
    expect(describeError('rate-limited')).toContain('Provider limit');
    expect(describeError('unknown')).toBe('Download failed');
  });
});
