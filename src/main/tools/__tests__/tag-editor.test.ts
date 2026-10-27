import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { parseFileMock, updateMock, runCommandMock, replaceMock, safeRmMock } = vi.hoisted(() => ({
  parseFileMock: vi.fn(),
  updateMock: vi.fn(async () => true),
  runCommandMock: vi.fn(async (_bin: string, _args: string[]): Promise<string> => ''),
  replaceMock: vi.fn(async () => undefined),
  safeRmMock: vi.fn(async () => undefined)
}));

vi.mock('music-metadata', () => ({ parseFile: parseFileMock }));
vi.mock('node-id3', () => ({ default: { Promise: { update: updateMock } } }));
vi.mock('../../binaries', () => ({ resolveBin: vi.fn(async () => '/usr/bin/ffmpeg') }));
vi.mock('../../utils/exec', () => ({ runCommand: runCommandMock }));
vi.mock('../../utils/fs-atomic', () => ({
  replaceFileAtomic: replaceMock,
  safeRm: safeRmMock
}));

import {
  buildTagMetadataArgs,
  isWritableTagFile,
  readAudioTags,
  sanitizeTagFields,
  tagsFromMetadata,
  writeAudioTags
} from '../tag-editor';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-tags-'));
  vi.clearAllMocks();
  updateMock.mockResolvedValue(true);
  runCommandMock.mockResolvedValue('');
  replaceMock.mockResolvedValue(undefined);
  safeRmMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('tagsFromMetadata', () => {
  it('maps common metadata to editor fields', () => {
    expect(
      tagsFromMetadata({
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumartist: 'Album Artist',
        genre: ['Rock', 'Pop'],
        year: 2024,
        track: { no: 3, of: 10 },
        disk: { no: 1, of: 2 }
      })
    ).toEqual({
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Album Artist',
      genre: 'Rock; Pop',
      year: '2024',
      track: '3',
      disc: '1'
    });
  });

  it('omits fields that are missing', () => {
    expect(tagsFromMetadata({})).toEqual({});
  });
});

describe('sanitizeTagFields', () => {
  it('trims values, caps length and drops unknown or non-string keys', () => {
    expect(sanitizeTagFields({ title: '  Hello  ', artist: 42, evil: 'x' })).toEqual({
      title: 'Hello'
    });
  });

  it('keeps an explicit empty string so a field can be cleared', () => {
    expect(sanitizeTagFields({ title: '' })).toEqual({ title: '' });
  });
});

describe('isWritableTagFile', () => {
  it('accepts containers with a safe writer', () => {
    for (const ext of ['mp3', 'flac', 'm4a', 'm4b', 'ogg', 'oga', 'opus', 'wav']) {
      expect(isWritableTagFile(`/music/song.${ext}`)).toBe(true);
    }
  });

  it('rejects formats without a safe writer', () => {
    expect(isWritableTagFile('/music/song.aac')).toBe(false);
  });
});

describe('buildTagMetadataArgs', () => {
  it('maps editor fields to ffmpeg metadata keys', () => {
    expect(buildTagMetadataArgs({ title: 'T', albumArtist: 'AA', year: '2024' })).toEqual([
      '-metadata',
      'title=T',
      '-metadata',
      'album_artist=AA',
      '-metadata',
      'date=2024'
    ]);
  });
});

describe('readAudioTags', () => {
  it('reads tags from a real file', async () => {
    const filePath = join(dir, 'song.mp3');
    await writeFile(filePath, '');
    parseFileMock.mockResolvedValueOnce({ common: { title: 'T', artist: 'A' }, format: {} });

    await expect(readAudioTags([filePath])).resolves.toEqual([
      { path: filePath, writable: true, tags: { title: 'T', artist: 'A' } }
    ]);
  });

  it('reports invalid paths instead of throwing', async () => {
    const [file] = await readAudioTags(['relative/song.mp3']);
    expect(file).toMatchObject({ writable: false, error: 'Invalid path' });
  });

  it('reports a parse error per file', async () => {
    const filePath = join(dir, 'broken.mp3');
    await writeFile(filePath, '');
    parseFileMock.mockRejectedValueOnce(new Error('bad tag'));

    const [file] = await readAudioTags([filePath]);
    expect(file.error).toContain('bad tag');
  });
});

describe('writeAudioTags', () => {
  it('writes ID3 frames for mp3', async () => {
    const filePath = join(dir, 'song.mp3');
    await writeFile(filePath, '');

    await expect(
      writeAudioTags([
        {
          path: filePath,
          tags: {
            title: 'T',
            artist: 'A',
            albumArtist: 'AA',
            year: '2024',
            track: '2',
            disc: '1'
          }
        }
      ])
    ).resolves.toEqual([{ path: filePath, success: true }]);

    expect(updateMock).toHaveBeenCalledWith(
      {
        title: 'T',
        artist: 'A',
        performerInfo: 'AA',
        year: '2024',
        trackNumber: '2',
        partOfSet: '1'
      },
      filePath
    );
  });

  it('uses an ffmpeg stream copy for flac', async () => {
    const filePath = join(dir, 'song.flac');
    await writeFile(filePath, '');

    await expect(
      writeAudioTags([{ path: filePath, tags: { title: 'T', albumArtist: 'AA', year: '2024' } }])
    ).resolves.toEqual([{ path: filePath, success: true }]);

    const args = runCommandMock.mock.calls[0]?.[1];
    expect(args).toContain('-c');
    expect(args).toContain('copy');
    expect(args).toContain('album_artist=AA');
    expect(args).toContain('date=2024');
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it('refuses formats without a safe writer', async () => {
    const filePath = join(dir, 'song.aac');
    await writeFile(filePath, '');

    const [result] = await writeAudioTags([{ path: filePath, tags: { title: 'T' } }]);
    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain('Unsupported');
  });

  it('rejects unsafe paths', async () => {
    const [result] = await writeAudioTags([{ path: 'relative/song.mp3', tags: {} }]);
    expect(result).toEqual({ path: 'relative/song.mp3', success: false, error: 'Invalid path' });
  });
});
