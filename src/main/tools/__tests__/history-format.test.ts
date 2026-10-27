import { describe, expect, it } from 'vitest';
import type { MediaFile } from '../../../shared/types/media';
import { buildHistoryRows, formatDuration, serializeHistory } from '../history-format';

function track(partial: Partial<MediaFile> & { path: string }): MediaFile {
  return {
    id: partial.path,
    name: partial.name ?? partial.path.split(/[\\/]/).pop() ?? partial.path,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 1000,
    playCount: 0,
    ...partial
  };
}

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('buildHistoryRows', () => {
  const files = [
    track({
      path: 'C:\\Music\\a.mp3',
      name: 'a.mp3',
      playCount: 5,
      lastPlayed: 3000,
      metadata: { title: 'Alpha', artist: 'A' }
    }),
    track({
      path: 'C:\\Music\\b.mp3',
      name: 'b.mp3',
      playCount: 0,
      metadata: { title: 'Beta, "B"' }
    }),
    track({
      path: 'C:\\Video\\c.mp4',
      type: 'video',
      name: 'c.mp4',
      playCount: 1,
      lastPlayed: 2000,
      metadata: { title: 'Clip' }
    }),
    track({
      path: 'C:\\Pics\\d.png',
      type: 'image',
      name: 'd.png',
      playCount: 9,
      lastPlayed: 9000
    })
  ];

  it('keeps only audio/video, filters played and sorts by last played', () => {
    const rows = buildHistoryRows(files, {
      onlyPlayed: true,
      type: 'all',
      sort: 'lastPlayed'
    });
    expect(rows.map((row) => row.path)).toEqual(['C:\\Music\\a.mp3', 'C:\\Video\\c.mp4']);
  });

  it('filters by media type and sorts by play count/title', () => {
    expect(
      buildHistoryRows(files, { onlyPlayed: false, type: 'video', sort: 'title' }).map(
        (row) => row.path
      )
    ).toEqual(['C:\\Video\\c.mp4']);
    expect(
      buildHistoryRows(files, { onlyPlayed: false, type: 'all', sort: 'playCount' }).map(
        (row) => row.playCount
      )
    ).toEqual([5, 1, 0]);
    expect(
      buildHistoryRows(files, { onlyPlayed: false, type: 'all', sort: 'title' }).map(
        (row) => row.title
      )
    ).toEqual(['Alpha', 'Beta, "B"', 'Clip']);
  });

  it('maps metadata with ISO dates and formatted duration', () => {
    const [row] = buildHistoryRows(
      [track({ path: '/a', duration: 65, playCount: 2, lastPlayed: 0, metadata: { title: 'T' } })],
      { onlyPlayed: true, type: 'all', sort: 'lastPlayed' }
    );
    expect(row.duration).toBe('1:05');
    expect(row.durationSec).toBe(65);
    expect(row.lastPlayed).toBe('');
  });
});

describe('serializeHistory', () => {
  const rows = buildHistoryRows(
    [
      track({
        path: 'C:\\Music\\b.mp3',
        playCount: 1,
        metadata: { title: 'Beta, "B"', artist: 'Artist' }
      })
    ],
    { onlyPlayed: true, type: 'all', sort: 'title' }
  );

  it('writes CSV with a BOM, CRLF and escaped quotes', () => {
    const csv = serializeHistory(rows, 'csv');
    expect(csv.startsWith('\uFEFFtitle,artist,album,albumArtist,genre,year,type,duration')).toBe(
      true
    );
    expect(csv).toContain('"Beta, ""B"""');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('writes JSON that round-trips', () => {
    expect(JSON.parse(serializeHistory(rows, 'json'))).toEqual(rows);
  });
});
