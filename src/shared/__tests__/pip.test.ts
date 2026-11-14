import { describe, expect, it } from 'vitest';
import {
  audioPipLayoutKind,
  getAudioPipSize,
  isAudioPipEdgeDock,
  type AudioPipElementId
} from '../types/pip';

const ALL: AudioPipElementId[] = [
  'cover',
  'trackInfo',
  'controls',
  'progress',
  'volume',
  'viz',
  'nextTrack',
  'eq'
];

describe('dock helpers', () => {
  it('recognizes edge docks only', () => {
    for (const dock of ['top', 'bottom', 'left', 'right'] as const) {
      expect(isAudioPipEdgeDock(dock)).toBe(true);
    }
    for (const dock of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
      expect(isAudioPipEdgeDock(dock)).toBe(false);
    }
  });

  it('maps docks to layouts', () => {
    expect(audioPipLayoutKind('left')).toBe('bar-v');
    expect(audioPipLayoutKind('right')).toBe('bar-v');
    expect(audioPipLayoutKind('top')).toBe('bar-h');
    expect(audioPipLayoutKind('bottom')).toBe('bar-h');
    expect(audioPipLayoutKind('top-left')).toBe('card');
  });
});

describe('getAudioPipSize', () => {
  it('sizes horizontal bars from the extra rows', () => {
    expect(getAudioPipSize('top', [])).toEqual({ width: 1280, height: 52 });
    expect(
      getAudioPipSize('bottom', ['cover', 'trackInfo', 'viz', 'nextTrack', 'eq'], {
        width: 1000.6,
        height: 0
      })
    ).toEqual({ width: 1001, height: 118 });
  });

  it('sizes vertical bars from width and the work-area height', () => {
    expect(getAudioPipSize('left', [])).toEqual({ width: 76, height: 720 });
    expect(
      getAudioPipSize('right', ['cover', 'volume', 'viz'], { width: 0, height: 1000.4 })
    ).toEqual({ width: 108, height: 1000 });
  });

  it('sizes cards from the element set', () => {
    expect(getAudioPipSize('top-left', [])).toEqual({ width: 280, height: 68 });
    expect(getAudioPipSize('bottom-right', ALL)).toEqual({ width: 348, height: 139 });
  });

  it('adds each card element independently', () => {
    expect(getAudioPipSize('top-left', ['cover'])).toEqual({ width: 324, height: 68 });
    expect(getAudioPipSize('top-left', ['volume'])).toEqual({ width: 280, height: 74 });
    expect(getAudioPipSize('top-left', ['viz'])).toEqual({ width: 280, height: 76 });
    expect(getAudioPipSize('top-left', ['nextTrack'])).toEqual({ width: 280, height: 76 });
    expect(getAudioPipSize('top-left', ['eq'])).toEqual({ width: 280, height: 76 });
  });
});
