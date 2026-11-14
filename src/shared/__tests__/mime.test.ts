import { describe, expect, it } from 'vitest';
import { getMimeType } from '../mime';

describe('getMimeType', () => {
  it('resolves known extensions case-insensitively', () => {
    expect(getMimeType('C:\\Media\\Clip.MP4')).toBe('video/mp4');
    expect(getMimeType('/music/Song.FLAC')).toBe('audio/flac');
    expect(getMimeType('/pics/Cover.PNG')).toBe('image/png');
  });

  it('falls back to octet-stream for unknown or missing extensions', () => {
    expect(getMimeType('/music/notes.txt')).toBe('application/octet-stream');
    expect(getMimeType('/music/README')).toBe('application/octet-stream');
    expect(getMimeType('.bashrc')).toBe('application/octet-stream');
  });
});
