import { describe, expect, it } from 'vitest';
import { nextStreamRetryStep } from '../audioEngineHelpers';

// Czysta drabinka ponowień strumienia: proxy → direct → proxy → fail.
describe('nextStreamRetryStep', () => {
  it('retries directly once when the proxy attempt is exhausted', () => {
    expect(nextStreamRetryStep('proxy', false, false)).toBe('direct');
  });

  it('retries through the proxy once more after a failed direct attempt', () => {
    expect(nextStreamRetryStep('direct', true, false)).toBe('proxy');
  });

  it('fails once both retry paths are used', () => {
    expect(nextStreamRetryStep('proxy', true, false)).toBe('fail');
    expect(nextStreamRetryStep('direct', true, true)).toBe('fail');
  });

  it('fails for a non-stream source (no mode)', () => {
    expect(nextStreamRetryStep(null, false, false)).toBe('fail');
  });
});
