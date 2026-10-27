import { describe, expect, it } from 'vitest';
import { splitTitle } from '../discord-title';

describe('splitTitle', () => {
  it('strips official video/audio/lyrics suffixes and splits artist', () => {
    expect(splitTitle('Skillet - Monster (Official Video)')).toEqual({
      title: 'Monster',
      artist: 'Skillet'
    });
    expect(splitTitle('Song [Official Audio]')).toEqual({ title: 'Song' });
  });

  it('keeps a known artist and does not split the title', () => {
    expect(splitTitle('A - B', 'Artist')).toEqual({ title: 'A - B', artist: 'Artist' });
  });

  it('falls back to the raw title when cleaning empties it', () => {
    expect(splitTitle('(Official Video)')).toEqual({ title: '(Official Video)' });
  });
});
