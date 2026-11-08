import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaFile } from '@renderer/types/media';

function track(path: string): MediaFile {
  return {
    id: path,
    name: path.split(/[\\/]/).pop() ?? path,
    path,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    addedAt: 0,
    playCount: 0
  };
}

async function load() {
  return import('../libraryIndex');
}

const FOLDERS = ['C:/Music'];

beforeEach(() => {
  vi.resetModules();
});

describe('directory tree', () => {
  function sample() {
    return [
      track('C:\\Music\\Rock\\a.mp3'),
      track('C:/Music/Jazz/b.mp3'),
      track('C:/Music/Rock/Sub/c.mp3'),
      track('C:/Music/d.mp3')
    ];
  }

  it('sorts direct child directories', async () => {
    const { getChildDirsIndexed } = await load();
    const tracks = sample();

    expect(getChildDirsIndexed('C:/Music', tracks, FOLDERS)).toEqual(['Jazz', 'Rock']);
    expect(getChildDirsIndexed('C:/Music/Rock', tracks, FOLDERS)).toEqual(['Sub']);
    expect(getChildDirsIndexed('C:\\Music', tracks, FOLDERS)).toEqual(['Jazz', 'Rock']);
    expect(getChildDirsIndexed('C:/Music/Nowhere', tracks, FOLDERS)).toEqual([]);
  });

  it('returns only tracks directly inside a directory', async () => {
    const { getDirectTracksIndexed } = await load();
    const tracks = sample();

    expect(getDirectTracksIndexed('C:/Music', tracks, FOLDERS).map((t) => t.name)).toEqual([
      'd.mp3'
    ]);
    expect(getDirectTracksIndexed('C:/Music/Rock', tracks, FOLDERS).map((t) => t.name)).toEqual([
      'a.mp3'
    ]);
    expect(getDirectTracksIndexed('C:/Music/Rock/Sub', tracks, FOLDERS).map((t) => t.name)).toEqual(
      ['c.mp3']
    );
    expect(getDirectTracksIndexed('C:/Music/None', tracks, FOLDERS)).toEqual([]);
  });

  it('collects tracks from all descendants', async () => {
    const { getAllTracksIndexed } = await load();
    const tracks = sample();

    expect(getAllTracksIndexed('C:/Music', tracks, FOLDERS).map((t) => t.name)).toEqual([
      'a.mp3',
      'b.mp3',
      'c.mp3',
      'd.mp3'
    ]);
    expect(getAllTracksIndexed('C:/Music/Rock', tracks, FOLDERS).map((t) => t.name)).toEqual([
      'a.mp3',
      'c.mp3'
    ]);
    expect(getAllTracksIndexed('C:/Music/Jazz', tracks, FOLDERS).map((t) => t.name)).toEqual([
      'b.mp3'
    ]);
    expect(getAllTracksIndexed('C:/Music/None', tracks, FOLDERS)).toEqual([]);
  });

  it('reuses the track array from the index', async () => {
    const { getDirectTracksIndexed } = await load();
    const tracks = sample();

    expect(getDirectTracksIndexed('C:/Music', tracks, FOLDERS)).toBe(
      getDirectTracksIndexed('C:/Music', tracks, FOLDERS)
    );
  });

  it('handles tracks at the filesystem root', async () => {
    const { getDirectTracksIndexed, getChildDirsIndexed } = await load();
    const tracks = [track('/a.mp3')];

    expect(getDirectTracksIndexed('/', tracks, [])).toHaveLength(1);
    expect(getChildDirsIndexed('/', tracks, [])).toEqual([]);
  });

  it('treats a relative filename as root-level', async () => {
    const { getDirectTracksIndexed } = await load();
    const tracks = [track('a.mp3')];

    expect(getDirectTracksIndexed('/', tracks, [])).toHaveLength(1);
  });
});

describe('cache', () => {
  it('returns the same index for identical inputs', async () => {
    const { getLibraryIndex } = await load();
    const tracks = [track('C:/Music/a.mp3')];

    expect(getLibraryIndex(tracks, FOLDERS)).toBe(getLibraryIndex(tracks, FOLDERS));
  });

  it('rebuilds after an in-place push', async () => {
    const { getLibraryIndex } = await load();
    const tracks = [track('C:/Music/a.mp3')];
    const first = getLibraryIndex(tracks, FOLDERS);

    tracks.push(track('C:/Music/b.mp3'));

    const second = getLibraryIndex(tracks, FOLDERS);
    expect(second).not.toBe(first);
    expect(second.directMap.get('C:/Music')).toHaveLength(2);
  });

  it('rebuilds when the track array is replaced', async () => {
    const { getLibraryIndex } = await load();
    const first = getLibraryIndex([track('C:/Music/a.mp3')], FOLDERS);
    const second = getLibraryIndex([track('C:/Music/a.mp3')], FOLDERS);

    expect(second).not.toBe(first);
  });

  it('rebuilds when the folder list changes', async () => {
    const { getLibraryIndex } = await load();
    const tracks = [track('C:/Music/a.mp3')];
    const first = getLibraryIndex(tracks, FOLDERS);
    const folders = [...FOLDERS];

    folders.push('D:/Other');

    expect(getLibraryIndex(tracks, folders)).not.toBe(first);
  });

  it('tracks folder mutations through the joined signature', async () => {
    const { getLibraryIndex } = await load();
    const tracks = [track('C:/Music/a.mp3')];
    const folders = [...FOLDERS];
    const first = getLibraryIndex(tracks, folders);

    folders.push('D:/Other');

    expect(getLibraryIndex(tracks, folders)).not.toBe(first);
  });
});
