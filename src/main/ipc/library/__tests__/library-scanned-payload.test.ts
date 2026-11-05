import { describe, expect, it } from 'vitest';
import type { MediaFile } from '../../../../shared/types/media';
import { sanitizeScannedPayload } from '../library-scanned-payload';

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

describe('sanitizeScannedPayload', () => {
  it('keeps valid files and folder types', () => {
    const result = sanitizeScannedPayload({
      files: [file('/a.mp3'), file('/b.jpg', 'image')],
      folderTypes: { '/music': 'audio', '/bad': 'nope' }
    });
    expect(result?.files.map((f) => f.path)).toEqual(['/a.mp3', '/b.jpg']);
    expect(result?.folderTypes).toEqual({ '/music': 'audio' });
  });

  it('rejects a payload without a files array', () => {
    expect(sanitizeScannedPayload(null)).toBeNull();
    expect(sanitizeScannedPayload({ files: 'nope' })).toBeNull();
  });

  it('drops malformed entries instead of persisting them', () => {
    const result = sanitizeScannedPayload({
      files: [file('/ok.mp3'), { path: '/bad' }, { name: 'no-path' }, null]
    });
    expect(result?.files.map((f) => f.path)).toEqual(['/ok.mp3']);
  });

  it('respects the file limit', () => {
    const result = sanitizeScannedPayload(
      { files: [file('/1.mp3'), file('/2.mp3'), file('/3.mp3')] },
      2
    );
    expect(result?.files).toHaveLength(2);
  });
});
