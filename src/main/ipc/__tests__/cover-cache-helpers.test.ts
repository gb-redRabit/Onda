import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  evictCache,
  findSiblingVideo,
  hashPath,
  isEnoent,
  uniqueId
} from '../cover/cover-cache-helpers';

function entry(bytes: number): { result: { data: string | null } } {
  return { result: { data: 'x'.repeat(bytes) } };
}

const sizeOf = (value: { result: { data: string | null } }): number =>
  value.result.data?.length ?? 0;

describe('evictCache', () => {
  it('evicts the oldest entries above the entry limit', () => {
    const map = new Map([
      ['a', entry(1)],
      ['b', entry(1)],
      ['c', entry(1)]
    ]);
    evictCache(map, 2);
    expect([...map.keys()]).toEqual(['b', 'c']);
  });

  it('evicts the oldest entries above the byte budget', () => {
    const map = new Map([
      ['a', entry(10)],
      ['b', entry(10)],
      ['c', entry(10)]
    ]);
    evictCache(map, 10, 25, sizeOf);
    expect([...map.keys()]).toEqual(['b', 'c']);
  });

  it('keeps every entry when both limits are satisfied', () => {
    const map = new Map([
      ['a', entry(10)],
      ['b', entry(10)]
    ]);
    evictCache(map, 10, 25, sizeOf);
    expect([...map.keys()]).toEqual(['a', 'b']);
  });

  it('ignores a byte budget without a size function', () => {
    const map = new Map([
      ['a', entry(10)],
      ['b', entry(10)]
    ]);
    evictCache(map, 10, 1);
    expect([...map.keys()]).toEqual(['a', 'b']);
  });

  it('applies both limits in one call', () => {
    const map = new Map([
      ['a', entry(10)],
      ['b', entry(10)],
      ['c', entry(10)],
      ['d', entry(10)]
    ]);
    evictCache(map, 3, 20, sizeOf);
    expect([...map.keys()]).toEqual(['c', 'd']);
  });
});

describe('hashPath', () => {
  it('returns a stable md5 of the lowercased path', () => {
    const expected = createHash('md5').update('c:/music/a.flac').digest('hex');
    expect(hashPath('C:/Music/A.flac')).toBe(expected);
    expect(hashPath('C:/Music/A.flac')).toBe(hashPath('c:/music/a.flac'));
  });

  it('produces a 32-character hex digest', () => {
    expect(hashPath('/tmp/x')).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe('isEnoent', () => {
  it('recognizes only ENOENT errors', () => {
    expect(isEnoent({ code: 'ENOENT' })).toBe(true);
    expect(isEnoent({ code: 'EPERM' })).toBe(false);
    expect(isEnoent(new Error('missing'))).toBe(false);
    expect(isEnoent(null)).toBe(false);
    expect(isEnoent(undefined)).toBe(false);
    expect(isEnoent('ENOENT')).toBe(false);
  });
});

describe('uniqueId', () => {
  it('returns distinct non-empty identifiers', () => {
    const ids = new Set(Array.from({ length: 100 }, () => uniqueId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toBeTruthy();
  });
});

describe('findSiblingVideo', () => {
  const root = mkdtempSync(join(tmpdir(), 'onda-sibling-video-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('returns the preferred sibling video for an audio file', () => {
    const audio = join(root, 'preferred.mp3');
    writeFileSync(audio, 'x');
    writeFileSync(join(root, 'preferred.mkv'), 'x');
    writeFileSync(join(root, 'preferred.mp4'), 'x');

    expect(findSiblingVideo(audio)).toBe(join(root, 'preferred.mp4'));
  });

  it('falls back to another supported video extension', () => {
    const audio = join(root, 'other.flac');
    writeFileSync(audio, 'x');
    writeFileSync(join(root, 'other.mkv'), 'x');

    expect(findSiblingVideo(audio)).toBe(join(root, 'other.mkv'));
  });

  it('returns null when there is no sibling video', () => {
    const audio = join(root, 'lonely.wav');
    writeFileSync(audio, 'x');
    expect(findSiblingVideo(audio)).toBeNull();
  });

  it('ignores non-audio files', () => {
    const video = join(root, 'clip.mp4');
    writeFileSync(video, 'x');
    writeFileSync(join(root, 'clip.mkv'), 'x');
    expect(findSiblingVideo(video)).toBeNull();
  });
});
