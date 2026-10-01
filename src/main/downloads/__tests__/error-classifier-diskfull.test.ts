import { describe, it, expect } from 'vitest';
import { classifyYtDlpError, describeError } from '../error-classifier';

// Pełny dysk wpadał do ogólnego koszyka "network", ponieważ
// klasyfikator znał tylko własne słownictwo stderr yt-dlp, nigdy ENOSPC.

describe('classifyYtDlpError — disk full', () => {
  it('recognises out-of-space messages', () => {
    expect(classifyYtDlpError('ERROR: No space left on device')).toBe('disk-full');
    expect(classifyYtDlpError('ENOSPC: no space left on device, write')).toBe('disk-full');
    expect(classifyYtDlpError('There is not enough space on the disk')).toBe('disk-full');
    expect(classifyYtDlpError('disk full')).toBe('disk-full');
  });

  it('has a human description', () => {
    expect(describeError('disk-full')).toMatch(/space/i);
  });
});
