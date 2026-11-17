import { describe, expect, it } from 'vitest';
import { resolveRedirectUrl, sanitizeStoredObject, urlAllowed } from '../plugins-guards';

describe('plugins guards edge inputs', () => {
  it('rejects non-object stored values', () => {
    expect(sanitizeStoredObject(null)).toEqual({});
    expect(sanitizeStoredObject(5)).toEqual({});
    expect(sanitizeStoredObject([])).toEqual({});
  });

  it('ignores unusable network patterns', () => {
    expect(urlAllowed('https://example.com/a', [])).toBe(false);
    expect(urlAllowed('https://example.com/a', ['a'.repeat(600)])).toBe(false);
  });

  it('returns null for invalid redirect bases', () => {
    expect(resolveRedirectUrl('http://[', '/next')).toBeNull();
    expect(resolveRedirectUrl('https://example.com', 'ftp://example.com/x')).toBeNull();
  });
});
