import { describe, it, expect } from 'vitest';
import { buildCoverSpec, COVER_FRAME_DEFAULT, COVER_CLIP_END_DEFAULT } from '../coverSpec';

describe('buildCoverSpec', () => {
  it('passes through parameterless types', () => {
    expect(buildCoverSpec({ type: 'none' })).toEqual({ type: 'none' });
    expect(buildCoverSpec({ type: 'thumbnail' })).toEqual({ type: 'thumbnail' });
  });

  it('requires a non-empty path for custom', () => {
    expect(buildCoverSpec({ type: 'custom', customPath: '  ' })).toBeUndefined();
    expect(buildCoverSpec({ type: 'custom', customPath: ' C:/c.png ' })).toEqual({
      type: 'custom',
      customPath: 'C:/c.png'
    });
  });

  it('defaults an empty frame time to 30 but keeps an explicit 0', () => {
    expect(buildCoverSpec({ type: 'frame' })).toEqual({
      type: 'frame',
      frameTime: COVER_FRAME_DEFAULT
    });
    expect(buildCoverSpec({ type: 'frame', frameTime: '' })).toEqual({
      type: 'frame',
      frameTime: COVER_FRAME_DEFAULT
    });
    expect(buildCoverSpec({ type: 'frame', frameTime: 0 })).toEqual({
      type: 'frame',
      frameTime: 0
    });
    expect(buildCoverSpec({ type: 'frame', frameTime: 12.5 })).toEqual({
      type: 'frame',
      frameTime: 12.5
    });
  });

  it('fills clip defaults and keeps explicit values', () => {
    expect(buildCoverSpec({ type: 'clip' })).toEqual({
      type: 'clip',
      clipStart: 0,
      clipEnd: COVER_CLIP_END_DEFAULT,
      clipFormat: 'webm'
    });
    expect(
      buildCoverSpec({ type: 'clip', clipStart: 10, clipEnd: 40, clipFormat: 'mp4' })
    ).toEqual({ type: 'clip', clipStart: 10, clipEnd: 40, clipFormat: 'mp4' });
  });

  it('honours explicit defaults', () => {
    expect(buildCoverSpec({ type: 'frame' }, { frameTime: 5 })).toEqual({
      type: 'frame',
      frameTime: 5
    });
    expect(buildCoverSpec({ type: 'clip' }, { clipEnd: 10 })).toEqual({
      type: 'clip',
      clipStart: 0,
      clipEnd: 10,
      clipFormat: 'webm'
    });
  });
});
