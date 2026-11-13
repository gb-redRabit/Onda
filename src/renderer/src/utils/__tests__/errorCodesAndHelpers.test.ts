import { describe, expect, it } from 'vitest';

import { errMsg, isNonNegativeInt } from '@shared/helpers';
import { errorCodeKey } from '@renderer/utils/errorCodes';

describe('errMsg', () => {
  it('extracts messages from error-like objects', () => {
    expect(errMsg(new Error('boom'))).toBe('boom');
    expect(errMsg({ message: 'custom' })).toBe('custom');
  });

  it('stringifies other values', () => {
    expect(errMsg('text')).toBe('text');
    expect(errMsg(42)).toBe('42');
    expect(errMsg(null)).toBe('null');
    expect(errMsg(undefined)).toBe('undefined');
  });
});

describe('isNonNegativeInt', () => {
  it('accepts non-negative integers', () => {
    expect(isNonNegativeInt(0)).toBe(true);
    expect(isNonNegativeInt(12)).toBe(true);
  });

  it('rejects negative, fractional and non-number values', () => {
    expect(isNonNegativeInt(-1)).toBe(false);
    expect(isNonNegativeInt(1.5)).toBe(false);
    expect(isNonNegativeInt('1')).toBe(false);
    expect(isNonNegativeInt(Number.NaN)).toBe(false);
  });
});

describe('errorCodeKey', () => {
  it.each([
    ['auth-required', 'downloads.errorAuthRequired'],
    ['bot-block', 'downloads.errorBotBlock'],
    ['private', 'downloads.errorPrivate'],
    ['not-found', 'downloads.errorNotFound'],
    ['network', 'downloads.errorNetwork'],
    ['proxy', 'downloads.errorProxy'],
    ['dependency', 'downloads.errorDependency'],
    ['unsupported', 'downloads.errorUnsupported'],
    ['disk-full', 'downloads.errorDiskFull'],
    ['rate-limited', 'downloads.errorRateLimited']
  ])('maps %s', (code, key) => {
    expect(errorCodeKey(code)).toBe(key);
  });

  it('returns an empty key for unknown and missing codes', () => {
    expect(errorCodeKey('mystery')).toBe('');
    expect(errorCodeKey()).toBe('');
  });
});
