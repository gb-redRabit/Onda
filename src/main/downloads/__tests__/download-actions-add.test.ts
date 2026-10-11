import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcDownloadJobInput } from '../../../shared/types/ipc';

// Siatka regresyjna dla kolejki pobierania: budowa zadania z wejścia IPC
// (`addDownloadJobs`), deduplikacja, zastępowanie nieudanych prób oraz mutacje
// kolejki. Runner i trwałość są mockowane — test jest offline i deterministyczny.

vi.mock('../download-runner', () => ({ pump: vi.fn(async () => {}) }));
vi.mock('../download-queue-store', () => ({
  persistJobs: vi.fn(async () => {}),
  queueFilePath: vi.fn(() => 'C:/tmp/ondaqueue.json'),
  capPersistedJobs: vi.fn((jobs: unknown) => jobs),
  loadPersistedJobs: vi.fn(async () => [])
}));
vi.mock('../download-queue-restore', () => ({
  trustedPrivateNetworkOrigins: vi.fn(async () => new Map()),
  restoreDownloadQueue: vi.fn(async () => {})
}));
vi.mock('../../ipc/network-target', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ipc/network-target')>();
  return { ...actual, privateNetworkAllowedForTarget: vi.fn(() => false) };
});

import {
  addDownloadJobs,
  cancelDownloadJob,
  pauseDownloadJob,
  resumeDownloadJob,
  moveDownloadToFront,
  listDownloadJobs
} from '../download-actions';
import { jobs, queueOrder } from '../download-state';

// Wypełnia wymagane pola wejścia IPC, żeby każdy test podawał tylko to, co istotne.
function jobInput(overrides: Partial<IpcDownloadJobInput> & { url: string }): IpcDownloadJobInput {
  return {
    title: 'T',
    kind: 'video',
    format: 'mp4',
    quality: 'best',
    outputDir: '',
    filenameTemplate: '{title}',
    ...overrides
  };
}

beforeEach(() => {
  jobs.clear();
  queueOrder.length = 0;
  vi.clearAllMocks();
});

describe('addDownloadJobs', () => {
  it('enqueues an explicit yt-dlp job with sensible defaults', async () => {
    const created = await addDownloadJobs([
      jobInput({
        url: 'https://www.youtube.com/watch?v=abc12345678',
        videoId: 'abc12345678',
        title: 'A Video',
        source: { mode: 'ytdlp' }
      })
    ]);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: 'pending', kind: 'video', format: 'mp4' });
    expect(created[0].source?.mode).toBe('ytdlp');
    expect(listDownloadJobs()).toHaveLength(1);
  });

  it('sanitizes http fileName and preserves source identity (no private-network trust)', async () => {
    const created = await addDownloadJobs([
      jobInput({
        url: 'https://cdn.example.com/a.mp4',
        source: {
          mode: 'http',
          sourceId: 'src-1',
          sourceItemId: 'item-1',
          fileName: '..\\..\\escape.bat',
          allowPrivateNetwork: true
        }
      })
    ]);
    expect(created).toHaveLength(1);
    expect(created[0].source).toMatchObject({
      mode: 'http',
      sourceId: 'src-1',
      sourceItemId: 'item-1',
      fileName: 'escape.bat',
      // Surowa flaga z wejścia NIE przetrwa — bez zapisanego zaufanego źródła jest false.
      allowPrivateNetwork: false
    });
  });

  it('accepts an explicit soundcloud job', async () => {
    const created = await addDownloadJobs([
      jobInput({
        url: 'https://soundcloud.com/artist/track',
        title: 'T',
        kind: 'audio',
        source: { mode: 'soundcloud' }
      })
    ]);
    expect(created).toHaveLength(1);
    expect(created[0].source?.mode).toBe('soundcloud');
  });

  it('skips a job with an unsupported url and no explicit source mode', async () => {
    const created = await addDownloadJobs([
      jobInput({ url: 'https://example.com/not-a-provider', videoId: 'zzz' })
    ]);
    expect(created).toHaveLength(0);
    expect(listDownloadJobs()).toHaveLength(0);
  });

  it('deduplicates by videoId within a session', async () => {
    const input = jobInput({
      url: 'https://www.youtube.com/watch?v=abc12345678',
      videoId: 'abc12345678',
      source: { mode: 'ytdlp' }
    });
    const first = await addDownloadJobs([input]);
    const second = await addDownloadJobs([input]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(listDownloadJobs()).toHaveLength(1);
  });

  it('replaces a previously failed job for the same videoId', async () => {
    const input = jobInput({
      url: 'https://www.youtube.com/watch?v=abc12345678',
      videoId: 'abc12345678',
      source: { mode: 'ytdlp' }
    });
    const first = await addDownloadJobs([input]);
    const failedId = first[0].id;
    const failed = jobs.get(failedId);
    if (failed) failed.status = 'error';
    const second = await addDownloadJobs([input]);
    expect(second).toHaveLength(1);
    expect(jobs.has(failedId)).toBe(false);
    expect(listDownloadJobs()).toHaveLength(1);
  });
});

describe('queue mutations', () => {
  const pendingInput = (videoId: string) =>
    jobInput({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      source: { mode: 'ytdlp' }
    });

  it('cancels a pending job and removes it from the queue', async () => {
    const [task] = await addDownloadJobs([pendingInput('aaaaaaaaaaa')]);
    expect(queueOrder).toContain(task.id);
    expect(cancelDownloadJob(task.id)).toBe(true);
    expect(listDownloadJobs()[0].status).toBe('cancelled');
    expect(queueOrder).not.toContain(task.id);
  });

  it('pauses and resumes a pending job', async () => {
    const [task] = await addDownloadJobs([pendingInput('bbbbbbbbbbb')]);
    expect(pauseDownloadJob(task.id)).toBe(true);
    expect(listDownloadJobs()[0].status).toBe('paused');
    expect(resumeDownloadJob(task.id)).toBe(true);
    expect(listDownloadJobs()[0].status).toBe('pending');
  });

  it('moves a pending job to the front of the queue', async () => {
    const created = await addDownloadJobs([
      pendingInput('ccccccccccc'),
      pendingInput('ddddddddddd')
    ]);
    const [first, second] = created;
    expect(queueOrder).toEqual([first.id, second.id]);
    expect(moveDownloadToFront(second.id)).toBe(true);
    expect(queueOrder).toEqual([second.id, first.id]);
  });

  it('returns false when mutating an unknown job', () => {
    expect(cancelDownloadJob('missing')).toBe(false);
    expect(pauseDownloadJob('missing')).toBe(false);
    expect(resumeDownloadJob('missing')).toBe(false);
    expect(moveDownloadToFront('missing')).toBe(false);
  });
});
