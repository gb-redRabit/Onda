import { describe, expect, it } from 'vitest';
import {
  buildMusicbrainzQuery,
  buildPreviewRows,
  displayTrackNumber,
  splitInitialQuery
} from '../musicbrainz';
import type { MusicbrainzRelease } from '@shared/types/ipc';

describe('buildMusicbrainzQuery', () => {
  it('builds quoted fields in a stable order', () => {
    expect(
      buildMusicbrainzQuery({
        artist: 'Daft Punk',
        title: 'One More Time',
        album: 'Discovery',
        year: '2001'
      })
    ).toBe('artist:"Daft Punk" AND release:"Discovery" AND "One More Time" AND date:2001');
  });

  it('omits empty fields and returns an empty string when nothing is left', () => {
    expect(buildMusicbrainzQuery({ artist: '  ', title: 'Song', album: '', year: '' })).toBe(
      '"Song"'
    );
    expect(buildMusicbrainzQuery({ artist: '', title: '', album: '', year: '' })).toBe('');
  });

  it('escapes embedded quotes', () => {
    expect(buildMusicbrainzQuery({ artist: 'The "Band"', title: '', album: '', year: '' })).toBe(
      'artist:"The \\"Band\\""'
    );
  });
});

describe('splitInitialQuery', () => {
  it('returns no fields for an empty query', () => {
    expect(splitInitialQuery('')).toEqual({});
  });

  it('keeps a raw search expression as the album field', () => {
    expect(splitInitialQuery('artist:Daft')).toEqual({ album: 'artist:Daft' });
    expect(splitInitialQuery('one AND two')).toEqual({ album: 'one AND two' });
  });

  it('splits "Artist - Title" and keeps later dashes in the title', () => {
    expect(splitInitialQuery('Daft Punk - One More Time')).toEqual({
      artist: 'Daft Punk',
      title: 'One More Time'
    });
    expect(splitInitialQuery('A - B - C')).toEqual({ artist: 'A', title: 'B - C' });
  });

  it('treats a plain phrase as the album', () => {
    expect(splitInitialQuery('  Discovery  ')).toEqual({ album: 'Discovery' });
  });
});

describe('displayTrackNumber', () => {
  it('prefers the number, then position, then the row index', () => {
    expect(displayTrackNumber({ number: '4', position: '9' }, 0)).toBe(4);
    expect(displayTrackNumber({ number: '0', position: '9' }, 0)).toBe(9);
    expect(displayTrackNumber({ position: 'not-a-number' }, 2)).toBe(3);
    expect(displayTrackNumber({}, 6)).toBe(7);
  });
});

describe('buildPreviewRows', () => {
  const release = {
    title: 'Discovery',
    date: '2001-03-12',
    'artist-credit': [{ name: 'Daft Punk' }],
    genres: [{ name: 'Electronic' }],
    media: [{ tracks: [{ title: 'One More Time' }] }]
  } as unknown as MusicbrainzRelease;

  it('returns no rows without a release', () => {
    expect(buildPreviewRows(null, null, {})).toEqual([]);
  });

  it('maps current metadata against the release', () => {
    const track = {
      name: 'fallback.mp3',
      metadata: {
        title: 'Old title',
        artist: 'Old artist',
        album: 'Old album',
        year: 1999,
        genre: 'Old genre',
        track: { no: 3 }
      }
    } as never;

    const rows = buildPreviewRows(release, track, { title: true, artist: true });

    expect(rows.map((r) => r.key)).toEqual([
      'title',
      'artist',
      'album',
      'year',
      'genre',
      'track',
      'cover'
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      'Tytuł',
      'Artysta',
      'Album',
      'Rok',
      'Gatunek',
      'Nr',
      'Okładka'
    ]);
    expect(rows.slice(0, 6).map((r) => r.now)).toEqual([
      'One More Time',
      'Daft Punk',
      'Discovery',
      '2001',
      'Electronic',
      '1'
    ]);
    expect(rows.slice(0, 6).map((r) => r.old)).toEqual([
      'Old title',
      'Old artist',
      'Old album',
      '1999',
      'Old genre',
      '3'
    ]);
    expect(rows.map((r) => r.checked)).toEqual([
      true,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined
    ]);
  });

  it('falls back to the file name and placeholders when metadata is missing', () => {
    const rows = buildPreviewRows(release, { name: 'song.mp3' } as never, {});

    expect(rows[0].old).toBe('song.mp3');
    expect(rows.slice(1, 6).map((r) => r.old)).toEqual(['—', '—', '—', '—', '—']);
    expect(rows[6]).toMatchObject({ old: '—', now: '—' });
  });

  it('marks a cover from the release and falls back to the artist credit name', () => {
    const withCover = {
      ...release,
      'artist-credit': [{ artist: { name: 'Credit Artist' } }],
      _coverData: [1, 2, 3]
    } as unknown as MusicbrainzRelease;

    const rows = buildPreviewRows(withCover, null, { cover: true });

    expect(rows[1].now).toBe('Credit Artist');
    expect(rows[6]).toMatchObject({ old: '—', now: 'okładka', checked: true });
  });

  it('shows the album when the release has no date or genres', () => {
    const minimal = {
      title: 'Untitled',
      'artist-credit': [],
      media: [{ tracks: [] }]
    } as unknown as MusicbrainzRelease;
    const rows = buildPreviewRows(minimal, null, {});

    expect(rows[0].now).toBe('—');
    expect(rows[1].now).toBe('—');
    expect(rows[3].now).toBe('—');
    expect(rows[4].now).toBe('—');
  });
});
