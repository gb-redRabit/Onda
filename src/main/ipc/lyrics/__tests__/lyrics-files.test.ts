import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { findLyricsSidecar } from '../lyrics-files';

const dirs: string[] = [];

async function makeDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'onda-lyrics-'));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('findLyricsSidecar', () => {
  it('prefers the exact <base>.lrc file', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'song.mp3'), '');
    await writeFile(join(dir, 'song.en.lrc'), '');
    await writeFile(join(dir, 'song.lrc'), '');
    await writeFile(join(dir, 'other.lrc'), '');

    expect(await findLyricsSidecar(join(dir, 'song.mp3'))).toBe(join(dir, 'song.lrc'));
  });

  it('falls back to a language variant', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'song.mp3'), '');
    await writeFile(join(dir, 'song.pl.lrc'), '');

    expect(await findLyricsSidecar(join(dir, 'song.mp3'))).toBe(join(dir, 'song.pl.lrc'));
  });

  it('supports SRT and prefers LRC when both exist', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'song.mp3'), '');
    await writeFile(join(dir, 'song.srt'), '');
    await writeFile(join(dir, 'song.lrc'), '');

    expect(await findLyricsSidecar(join(dir, 'song.mp3'))).toBe(join(dir, 'song.lrc'));
  });

  it('falls back to an SRT sidecar', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'song.mp3'), '');
    await writeFile(join(dir, 'song.en.srt'), '');

    expect(await findLyricsSidecar(join(dir, 'song.mp3'))).toBe(join(dir, 'song.en.srt'));
  });

  it('does not match unrelated prefixes or extensions', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'song.mp3'), '');
    await writeFile(join(dir, 'song-remix.lrc'), '');
    await writeFile(join(dir, 'song.lrc.txt'), '');

    expect(await findLyricsSidecar(join(dir, 'song.mp3'))).toBe(null);
  });
});
