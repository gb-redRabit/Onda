import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readdir, rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { isSubtitleFile, findSiblingSubtitleFiles, moveSubtitlesToFolder } from '../subtitle-files';

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

  it('returns an empty list when the media folder does not exist', async () => {
    await expect(findSiblingSubtitleFiles('/missing/onda/dir/Song.mp3')).resolves.toEqual([]);
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

  it('returns zero when there are no sidecar subtitles', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-subs-move-none-'));
    try {
      const media = join(dir, 'Song.mp3');
      await writeFile(media, 'x');
      await expect(moveSubtitlesToFolder(media)).resolves.toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('leaves a subtitle in place when the move fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'onda-subs-move-fail-'));
    try {
      const media = join(dir, 'Song.mp3');
      await writeFile(media, 'x');
      await writeFile(join(dir, 'Song.pl.srt'), '1');
      // Katalog o nazwie docelowej sprawia, że rename pliku nie może się udać.
      await mkdir(join(dir, 'Subtitles', 'Song.pl.srt'), { recursive: true });

      await expect(moveSubtitlesToFolder(media)).resolves.toBe(0);
      await expect(readdir(dir)).resolves.toContain('Song.pl.srt');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
