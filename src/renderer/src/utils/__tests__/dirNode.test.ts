import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  canonicalPath: vi.fn((p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')),
  getAll: vi.fn(),
  getDirect: vi.fn(),
  getChildDirs: vi.fn(),
  matches: vi.fn(() => true)
}));

vi.mock('@renderer/utils/path', () => ({ canonicalPath: h.canonicalPath }));
vi.mock('@renderer/utils/libraryIndex', () => ({
  getAllTracksIndexed: h.getAll,
  getDirectTracksIndexed: h.getDirect,
  getChildDirsIndexed: h.getChildDirs
}));
vi.mock('@renderer/utils/librarySearch', () => ({ trackMatchesQuery: h.matches }));

import { EMPTY_CHILD_META, buildChildMeta, childCanonical, directTracksInDir } from '../dirNode';

type Track = { path: string; type?: string; duration?: number; title?: string };

const track = (path: string, over: Partial<Track> = {}): Track => ({ path, ...over });

beforeEach(() => {
  h.canonicalPath.mockClear();
  h.getAll.mockReset().mockReturnValue([]);
  h.getDirect.mockReset().mockReturnValue([]);
  h.matches.mockReset().mockReturnValue(true);
});

describe('EMPTY_CHILD_META', () => {
  it('contains empty collections and zero counters', () => {
    expect(EMPTY_CHILD_META).toEqual({
      subtree: [],
      audio: [],
      audioCount: 0,
      duration: 0,
      directAll: [],
      directAudio: [],
      directImages: []
    });
  });
});

describe('childCanonical', () => {
  it('joins the canonical parent with the child name', () => {
    expect(childCanonical('D:\\Music\\', 'Rock')).toBe('D:/Music/Rock');
    expect(h.canonicalPath).toHaveBeenCalledWith('D:\\Music\\');
  });
});

describe('directTracksInDir', () => {
  it('filters direct tracks by the query', () => {
    const tracks = [track('a'), track('b')];
    h.getDirect.mockReturnValue(tracks);
    h.matches.mockImplementation(((t: Track) => t.path === 'b') as never);

    const result = directTracksInDir('D:/Music', tracks as never, {} as never, 'b');

    expect(h.getDirect).toHaveBeenCalledWith('D:/Music', tracks, {});
    expect(result).toEqual([track('b')]);
  });
});

describe('buildChildMeta', () => {
  it('builds metadata for every child', () => {
    const music = track('D:/Music/Rock/a.mp3', { type: 'audio', duration: 100 });
    const cover = track('D:/Music/Rock/cover.png', { type: 'image' });
    h.getAll.mockReturnValue([music, cover]);
    h.getDirect.mockReturnValue([music, cover]);

    const result = buildChildMeta(
      'D:/Music',
      ['Rock'],
      [music, cover] as never,
      {} as never,
      'query'
    );

    expect(h.getAll).toHaveBeenCalledWith('D:/Music/Rock', [music, cover], {});
    expect(h.matches).toHaveBeenCalledWith(music, 'query');
    expect(result.Rock).toEqual({
      subtree: [music, cover],
      audio: [music],
      audioCount: 1,
      duration: 100,
      directAll: [music, cover],
      directAudio: [music],
      directImages: [cover]
    });
  });

  it('treats a missing duration as zero', () => {
    const music = track('D:/Music/Rock/a.mp3', { type: 'audio' });
    h.getAll.mockReturnValue([music]);
    h.getDirect.mockReturnValue([]);

    const result = buildChildMeta('D:/Music', ['Rock'], [] as never, {} as never, '');

    expect(result.Rock.duration).toBe(0);
    expect(result.Rock.directAll).toEqual([]);
  });

  it('returns an empty map without children', () => {
    expect(buildChildMeta('D:/Music', [], [] as never, {} as never, '')).toEqual({});
  });
});
