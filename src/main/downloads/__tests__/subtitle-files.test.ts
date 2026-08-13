import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  isSubtitleFile,
  findSiblingSubtitleFiles,
  moveSubtitlesToFolder
} from '../subtitle-files';

describe('isSubtitleFile', () => {
  it('recognizes srt/vtt/ass extensions', () => {
    expect(isSubtitleFile('Title.pl.srt')).toBe(true);
    expect(isSubtitleFile('Title.en.vtt')).toBe(true);
    expect(isSubtitleFile('Title.ass')).toBe(true);
    expect(isSubtitleFile('Title.mp3')).toBe(false);
  });
});

describe('findSiblingSubtitleFiles', () => {
  it('finds subtitle files named after the media base name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-subs-find-'));
    try {
      const media = join(dir, 'Song.mp3');
      await writeFile(media, 'x');
      await writeFile(join(dir, 'Song.pl.srt'), '1');
      await writeFile(join(dir, 'Song.en.srt'), '2');
      await writeFile(join(dir, 'Other.srt'), '3');
      const files = await findSiblingSubtitleFiles(media);
      expect(files.sort()).toEqual([join(dir, 'Song.en.srt'), join(dir, 'Song.pl.srt')].sort());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty list when no subtitles exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-subs-none-'));
    try {
      const media = join(dir, 'Song.mp3');
      await writeFile(media, 'x');
      await expect(findSiblingSubtitleFiles(media)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('moveSubtitlesToFolder', () => {
  it('moves sidecar subtitles into a Subtitles/ folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-subs-move-'));
    try {
      const media = join(dir, 'Song.mp3');
      await writeFile(media, 'x');
      await writeFile(join(dir, 'Song.pl.srt'), '1');
      await expect(moveSubtitlesToFolder(media)).resolves.toBe(1);
      const names = await readdir(join(dir, 'Subtitles'));
      expect(names).toEqual(['Song.pl.srt']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
