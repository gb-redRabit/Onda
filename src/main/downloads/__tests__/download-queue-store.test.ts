import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import type { IpcDownloadTask } from '../../../shared/types/ipc';
import { loadPersistedJobs, persistJobs, capPersistedJobs } from '../download-queue-store';

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'onda-queue-test-'));
  file = join(dir, 'downloads-queue.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function task(id: string, status: IpcDownloadTask['status']): IpcDownloadTask {
  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Video ${id}`,
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    outputDir: '',
    filenameTemplate: '{title}',
    progress: 0,
    speed: '',
    eta: '',
    status,
    coverStatus: 'none',
    startedAt: Date.now()
  };
}

describe('download-queue-store', () => {
  it('returns an empty list for a missing file', async () => {
    await expect(loadPersistedJobs(file)).resolves.toEqual([]);
  });

  it('round-trips persisted jobs', async () => {
    const jobs = [task('a', 'pending'), task('b', 'paused'), task('c', 'error')];
    await persistJobs(file, jobs);
    await expect(loadPersistedJobs(file)).resolves.toEqual(jobs);
  });

  it('ignores a store with an unknown schema version', async () => {
    await persistJobs(file, [task('a', 'pending')]);
    const raw = JSON.parse(await readFile(file, 'utf-8')) as { version: number; jobs: unknown[] };
    raw.version = 99;
    await writeFile(file, JSON.stringify(raw), 'utf-8');
    await expect(loadPersistedJobs(file)).resolves.toEqual([]);
  });

  it('drops malformed rows', async () => {
    const broken = [{ id: 'x' }, { url: 'https://example.com' }, task('ok', 'pending')];
    await writeFile(file, JSON.stringify({ version: 1, jobs: broken }), 'utf-8');
    const loaded = await loadPersistedJobs(file);
    expect(loaded.map((j) => j.id)).toEqual(['ok']);
  });
});

describe('capPersistedJobs', () => {
  it('keeps active jobs and trims error history when over the limit', () => {
    const many = Array.from({ length: 600 }, (_, i) =>
      task(`v${i}`, i < 500 ? 'pending' : 'error')
    );
    const capped = capPersistedJobs(many);
    expect(capped.length).toBeLessThanOrEqual(500);
    // All non-error jobs are kept; the excess error jobs are trimmed.
    expect(capped.filter((j) => j.status !== 'error').length).toBe(500);
    expect(capped.every((j) => j.status !== 'error')).toBe(true);
  });

  it('keeps everything under the limit unchanged', () => {
    const few = [task('a', 'pending'), task('b', 'error')];
    expect(capPersistedJobs(few)).toEqual(few);
  });
});
