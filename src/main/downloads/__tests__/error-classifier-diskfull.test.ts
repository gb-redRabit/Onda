import { describe, it, expect } from 'vitest';
import { classifyYtDlpError, describeError } from '../error-classifier';

// A full disk used to fall through to the generic "network" bucket because the
// classifier only knew yt-dlp's own stderr vocabulary, never ENOSPC.

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
