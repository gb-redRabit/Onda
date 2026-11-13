import { describe, expect, it } from 'vitest';

import { DEFAULT_CORNER_ELEMENTS, DEFAULT_EDGE_ELEMENTS, PREVIEW_STATE } from '../pip-defaults';

describe('PiP defaults', () => {
  it('offers the corner element set', () => {
    expect(DEFAULT_CORNER_ELEMENTS).toEqual([
      'cover',
      'trackInfo',
      'controls',
      'progress',
      'volume'
    ]);
  });

  it('adds the visualizer for edge docks', () => {
    expect(DEFAULT_EDGE_ELEMENTS).toEqual([...DEFAULT_CORNER_ELEMENTS, 'viz']);
  });

  it('provides a complete preview state', () => {
    expect(PREVIEW_STATE).toMatchObject({
      artist: 'Onda',
      coverData: null,
      coverType: null,
      isPlaying: true,
      currentTime: 42,
      duration: 214,
      volume: 0.8,
      isMuted: false,
      shuffle: false,
      repeat: 'none'
    });
    expect(PREVIEW_STATE.trackName).toBeTruthy();
    expect(PREVIEW_STATE.nextTrackName).toBeTruthy();
    expect(PREVIEW_STATE.nextTrackArtist).toBe('Onda');
    expect(PREVIEW_STATE.currentTime!).toBeLessThanOrEqual(PREVIEW_STATE.duration!);
  });
});
