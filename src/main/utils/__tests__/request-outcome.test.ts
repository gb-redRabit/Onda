import { describe, expect, it, vi, afterEach } from 'vitest';
import { classifyRequestError, isRateLimited, logRequestOutcome } from '../request-outcome';

// 429/4xx/timeout to normalne warunki dla zdalnych baz napisów — nie mogą być logowane
// jako ostrzeżenia ze stosem.

afterEach(() => {
  vi.restoreAllMocks();
});

describe('classifyRequestError', () => {
  it('treats HTTP status and timeouts as expected', () => {
    expect(classifyRequestError(new Error('HTTP 429')).kind).toBe('http');
    expect(classifyRequestError(new Error('HTTP 404')).kind).toBe('http');
    expect(classifyRequestError(new Error('Timeout')).kind).toBe('network');
    expect(classifyRequestError(new Error('socket hang up')).kind).toBe('network');
  });

  it('flags anything else as unexpected', () => {
    expect(classifyRequestError(new Error('boom')).kind).toBe('unexpected');
    expect(classifyRequestError('weird')).toEqual({ kind: 'unexpected', message: 'weird' });
  });
});

describe('isRateLimited', () => {
  it('detects 429 and 503', () => {
    expect(isRateLimited(new Error('HTTP 429'))).toBe(true);
    expect(isRateLimited(new Error('HTTP 503'))).toBe(true);
    expect(isRateLimited(new Error('HTTP 404'))).toBe(false);
  });
});

describe('logRequestOutcome', () => {
  it('logs expected outcomes quietly (info, no warning, no stack)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(logRequestOutcome('napiprojekt', 'fetch', new Error('HTTP 429'))).toBe('HTTP 429');
    expect(warn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('[Onda/napiprojekt]', 'fetch: HTTP 429');
  });

  it('warns (without a stack) on an unexpected failure', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(logRequestOutcome('opensubtitles', 'search', new Error('boom'))).toBe('boom');
    expect(warn).toHaveBeenCalledWith('[Onda/opensubtitles]', 'search failed', 'boom');
  });
});
