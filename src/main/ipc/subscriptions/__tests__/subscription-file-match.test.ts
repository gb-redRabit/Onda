import { describe, expect, it } from 'vitest';
import { matchDownloadedFiles, matchKey } from '../subscription-file-match';

const file = (name: string) => ({ name, path: `D:/dl/${name}` });

describe('matchKey', () => {
  it('normalizes case, punctuation and extension', () => {
    expect(matchKey('Night Date. Lofi & Chillhop (Official).MP3')).toBe(
      'night date lofi chillhop official'
    );
  });
});

describe('matchDownloadedFiles', () => {
  it('matches by title and strips the channel suffix', () => {
    const result = matchDownloadedFiles(
      [
        { id: 'v1', title: 'Night Date. Lofi & Chillhop' },
        { id: 'v2', title: 'Rainy Day' }
      ],
      [
        file('Night Date. Lofi & Chillhop - Club Kawaii.mp3'),
        file('Night Date. Lofi & Chillhop - Club Kawaii.mp4')
      ],
      'Club Kawaii',
      '.mp3'
    );

    expect(result.files.v1).toBe('D:/dl/Night Date. Lofi & Chillhop - Club Kawaii.mp3');
    expect(result.files.v2).toBeUndefined();
    expect(result.unmatchedIds).toEqual(['v2']);
  });

  it('prefers the requested extension and ignores unrelated files', () => {
    const result = matchDownloadedFiles(
      [{ id: 'v1', title: 'Track' }],
      [file('Track - Channel.mp4'), file('Track - Channel.mp3'), file('Other.mp3')],
      'Channel',
      '.mp3'
    );

    expect(result.files.v1).toBe('D:/dl/Track - Channel.mp3');
  });

  it('reports every title without a file', () => {
    const result = matchDownloadedFiles(
      [
        { id: 'v1', title: 'A' },
        { id: 'v2', title: 'B' }
      ],
      [],
      'Channel'
    );

    expect(result.files).toEqual({});
    expect(result.unmatchedIds).toEqual(['v1', 'v2']);
  });
});
