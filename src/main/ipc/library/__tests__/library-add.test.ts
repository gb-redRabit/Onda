import { describe, it, expect } from 'vitest';
import type { MediaFile } from '../../../../shared/types/media';
import type { LibraryScannedData } from '../library-store';
import { mergeAddedFiles } from '../library-add';

function file(path: string, type: MediaFile['type'] = 'audio'): MediaFile {
  return {
    id: path,
    name: path,
    path,
    extension: 'mp3',
    mimeType: '',
    size: 1,
    type,
    addedAt: 0,
    playCount: 0
  };
}

function library(files: MediaFile[] = []): LibraryScannedData {
  return { files, folderTypes: {} };
}

describe('mergeAddedFiles', () => {
  it('appends new files and classifies the folder', () => {
    const result = mergeAddedFiles(library(), [file('/music/a.mp3')]);

    expect(result.added).toBe(1);
    expect(result.files.map((f) => f.path)).toEqual(['/music/a.mp3']);
    expect(result.folderTypes['/music']).toBe('audio');
    expect(result.dirs).toEqual(['/music']);
  });

  it('skips duplicates and keeps the existing record', () => {
    const existing = file('/music/a.mp3');
    existing.playCount = 5;
    const scanned = file('/music/a.mp3');
    scanned.playCount = 0;

    const result = mergeAddedFiles(library([existing]), [scanned]);

    expect(result.added).toBe(0);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].playCount).toBe(5);
  });

  it('marks a folder as mixed when types differ', () => {
    const result = mergeAddedFiles(library(), [
      file('/media/a.mp3', 'audio'),
      file('/media/b.mp4', 'video'),
      file('/media/c.jpg', 'image')
    ]);

    expect(result.folderTypes['/media']).toBe('mixed');
    expect(result.added).toBe(3);
  });

  it('deduplicates the same path inside one drop', () => {
    const result = mergeAddedFiles(library(), [file('/music/a.mp3'), file('/music/a.mp3')]);

    expect(result.added).toBe(1);
    expect(result.files).toHaveLength(1);
  });
});
