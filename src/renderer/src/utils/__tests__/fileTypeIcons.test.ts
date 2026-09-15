import { describe, it, expect } from 'vitest';
import { Captions, File, Film, Image, ListMusic, Music2 } from '@lucide/vue';
import { fileTypeIcon } from '../fileTypeIcons';

describe('fileTypeIcon', () => {
  it('maps known categories to their icons', () => {
    expect(fileTypeIcon('.mp3')).toBe(Music2);
    expect(fileTypeIcon('.MP4')).toBe(Film);
    expect(fileTypeIcon('.png')).toBe(Image);
    expect(fileTypeIcon('.m3u')).toBe(ListMusic);
    expect(fileTypeIcon('.srt')).toBe(Captions);
  });

  it('falls back to the generic file icon for unknown/empty extensions', () => {
    expect(fileTypeIcon('.dll')).toBe(File);
    expect(fileTypeIcon('')).toBe(File);
    expect(fileTypeIcon(undefined)).toBe(File);
  });
});
