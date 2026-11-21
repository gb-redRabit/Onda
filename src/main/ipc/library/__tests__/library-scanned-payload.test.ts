import { describe, expect, it } from 'vitest';
import type { MediaFile } from '../../../../shared/types/media';
import { sanitizeScannedPatch } from '../library-scanned-payload';

function file(path: string, type: MediaFile['type'] = 'audio'): MediaFile {
  return {
    id: path,
    path,
    name: path.split('/').pop() ?? path,
    extension: '.mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type,
    addedAt: 0,
    playCount: 0
  } as MediaFile;
}

describe('sanitizeScannedPatch', () => {
  it('keeps valid upserts, removals and folder types', () => {
    const result = sanitizeScannedPatch({
      upsertFiles: [file('/a.mp3'), file('/b.jpg', 'image')],
      removePaths: ['/old.mp3', '', ' /old.mp3 ', 42],
      folderTypes: { '/music': 'audio', '/bad': 'nope' }
    });
    expect(result?.upsertFiles.map((f) => f.path)).toEqual(['/a.mp3', '/b.jpg']);
    expect(result?.removePaths).toEqual(['/old.mp3']);
    expect(result?.folderTypes).toEqual({ '/music': 'audio' });
  });

  it('rejects an empty or malformed patch', () => {
    expect(sanitizeScannedPatch(null)).toBeNull();
    expect(sanitizeScannedPatch({})).toBeNull();
    expect(sanitizeScannedPatch({ upsertFiles: 'nope' })).toBeNull();
    expect(sanitizeScannedPatch({ removePaths: 'nope' })).toBeNull();
    expect(sanitizeScannedPatch({ folderTypes: [] })).toBeNull();
  });

  it('allows a patch with only one kind of change', () => {
    expect(sanitizeScannedPatch({ removePaths: ['/gone.mp3'] })).toEqual({
      upsertFiles: [],
      removePaths: ['/gone.mp3']
    });
    expect(sanitizeScannedPatch({ upsertFiles: [] })?.upsertFiles).toEqual([]);
  });

  it('drops malformed entries instead of persisting them', () => {
    const result = sanitizeScannedPatch({
      upsertFiles: [file('/ok.mp3'), { path: '/bad' }, { name: 'no-path' }, null]
    });
    expect(result?.upsertFiles.map((f) => f.path)).toEqual(['/ok.mp3']);
  });

  it('respects the file and removal limits', () => {
    const result = sanitizeScannedPatch(
      {
        upsertFiles: [file('/1.mp3'), file('/2.mp3'), file('/3.mp3')],
        removePaths: ['/a', '/b', '/c']
      },
      2
    );
    expect(result?.upsertFiles).toHaveLength(2);
    expect(result?.removePaths).toEqual(['/a', '/b']);
  });
});
