import { describe, expect, it } from 'vitest';
import {
  computeTrackNormalization,
  nextStreamRetryStep,
  resolveReplayGainRatio
} from '../audioEngineHelpers';

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

describe('ReplayGain helpers', () => {
  it('clamps the ratio and ignores disabled/invalid values', () => {
    expect(computeTrackNormalization(true, 0.5)).toBe(0.5);
    expect(computeTrackNormalization(true, 10)).toBe(4);
    expect(computeTrackNormalization(true, 0.01)).toBe(0.25);
    expect(computeTrackNormalization(false, 0.5)).toBe(1);
    expect(computeTrackNormalization(true, undefined)).toBe(1);
    expect(computeTrackNormalization(true, 0)).toBe(1);
  });

  it('picks the album value in album mode and falls back to the track value', () => {
    expect(
      resolveReplayGainRatio('album', { replayGainAlbumGain: 0.7, replayGainTrackGain: 0.5 })
    ).toBe(0.7);
    expect(resolveReplayGainRatio('album', { replayGainTrackGain: 0.5 })).toBe(0.5);
  });

  it('picks the track value in track mode and falls back to the album value', () => {
    expect(
      resolveReplayGainRatio('track', { replayGainAlbumGain: 0.7, replayGainTrackGain: 0.5 })
    ).toBe(0.5);
    expect(resolveReplayGainRatio('track', { replayGainAlbumGain: 0.7 })).toBe(0.7);
  });

  it('returns nothing when the mode is off or metadata is missing', () => {
    expect(resolveReplayGainRatio('off', { replayGainTrackGain: 0.5 })).toBeUndefined();
    expect(resolveReplayGainRatio('track', undefined)).toBeUndefined();
  });
});
