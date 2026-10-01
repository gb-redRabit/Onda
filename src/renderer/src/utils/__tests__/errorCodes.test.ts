import { describe, it, expect } from 'vitest';
import { errorCodeKey } from '../errorCodes';

describe('errorCodeKey', () => {
  it('maps disk-full to its locale key', () => {
    expect(errorCodeKey('disk-full')).toBe('downloads.errorDiskFull');
  });

  it('maps the other known codes and ignores unknown ones', () => {
    expect(errorCodeKey('network')).toBe('downloads.errorNetwork');
    expect(errorCodeKey('unsupported')).toBe('downloads.errorUnsupported');
    expect(errorCodeKey('nope')).toBe('');
    expect(errorCodeKey(undefined)).toBe('');
  });
});
