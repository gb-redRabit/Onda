import { describe, expect, it, vi } from 'vitest';

vi.mock('../../downloads/error-classifier', () => ({
  classifyYtDlpError: (message: string) => `code:${message}`
}));
vi.mock('../soundcloud/soundcloud-client', () => ({
  ScApiError: class ScApiError extends Error {}
}));

import { errorCodeOf } from '../soundcloud/soundcloud-error';
import { ScApiError } from '../soundcloud/soundcloud-client';

describe('errorCodeOf', () => {
  it('maps SoundCloud API errors to a network code', () => {
    expect(errorCodeOf(new ScApiError('boom'))).toBe('network');
  });

  it('classifies other errors and plain values', () => {
    expect(errorCodeOf(new Error('rate limit'))).toBe('code:rate limit');
    expect(errorCodeOf('plain failure')).toBe('code:plain failure');
  });
});
