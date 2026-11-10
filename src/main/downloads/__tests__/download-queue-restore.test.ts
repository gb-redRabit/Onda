import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
  getPath: vi.fn(() => 'C:/user'),
  loadSources: vi.fn(),
  loadPersistedJobs: vi.fn(),
  queueFilePath: vi.fn(() => 'C:/user/queue.json'),
  isAllowedDownloadDir: vi.fn((..._args: any[]) => true),
  resolveOutputDir: vi.fn((job: { outputDir?: string }) => `resolved:${job.outputDir ?? ''}`),
  pump: vi.fn(),
  jobs: new Map<string, Record<string, unknown>>(),
  queueOrder: [] as string[],
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock('electron', () => ({ app: { getPath: h.getPath } }));
vi.mock('../../../shared/logger', () => ({
  logger: { info: h.loggerInfo, warn: h.loggerWarn, error: vi.fn() }
}));
vi.mock('../download-helpers', () => ({
  isAllowedDownloadDir: h.isAllowedDownloadDir,
  resolveOutputDir: h.resolveOutputDir
}));
vi.mock('../../ipc/sources/sources-store', () => ({ loadSources: h.loadSources }));
vi.mock('../download-queue-store', () => ({
  loadPersistedJobs: h.loadPersistedJobs,
  queueFilePath: h.queueFilePath
}));
vi.mock('../download-state', () => ({ jobs: h.jobs, queueOrder: h.queueOrder }));
vi.mock('../download-runner', () => ({ pump: h.pump }));

import { restoreDownloadQueue, trustedPrivateNetworkOrigins } from '../download-queue-restore';

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    baseUrl: 'https://api.example/path',
    allowPrivateNetwork: true,
    ...overrides
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return { id: 't1', status: 'pending', ...overrides };
}

beforeEach(() => {
  h.getPath.mockClear();
  h.loadSources.mockReset();
  h.loadSources.mockResolvedValue([]);
  h.loadPersistedJobs.mockReset();
  h.loadPersistedJobs.mockResolvedValue([]);
  h.queueFilePath.mockClear();
  h.isAllowedDownloadDir.mockReset();
  h.isAllowedDownloadDir.mockReturnValue(true);
  h.resolveOutputDir.mockReset();
  h.resolveOutputDir.mockImplementation(
    (job: { outputDir?: string }) => `resolved:${job.outputDir ?? ''}`
  );
  h.pump.mockReset();
  h.jobs.clear();
  h.queueOrder.length = 0;
  h.loggerInfo.mockReset();
  h.loggerWarn.mockReset();
});

describe('trustedPrivateNetworkOrigins', () => {
  it('maps trusted source ids to their stored origins', async () => {
    h.loadSources.mockResolvedValue([
      source(),
      source({ id: 's2', baseUrl: 'http://192.168.1.10:8080/x' }),
      source({ id: 's3', allowPrivateNetwork: false }),
      source({ id: 's4', baseUrl: '' })
    ]);

    const origins = await trustedPrivateNetworkOrigins();

    expect(origins).toEqual(
      new Map([
        ['s1', 'https://api.example'],
        ['s2', 'http://192.168.1.10:8080']
      ])
    );
    expect(h.loadSources).toHaveBeenCalledWith(join('C:/user', 'sources.json'));
  });

  it('skips invalid origins and logs read failures', async () => {
    h.loadSources.mockResolvedValueOnce([
      source({ id: 'bad', baseUrl: 'not a url' }),
      source({ id: 'good' })
    ]);

    await expect(trustedPrivateNetworkOrigins()).resolves.toEqual(
      new Map([['good', 'https://api.example']])
    );

    h.loadSources.mockRejectedValueOnce(new Error('disk'));
    await expect(trustedPrivateNetworkOrigins()).resolves.toEqual(new Map());
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'could not read sources for private-network trust',
      expect.any(Error)
    );
  });
});

describe('restoreDownloadQueue', () => {
  it('does nothing for an empty queue', async () => {
    await restoreDownloadQueue();

    expect(h.loadPersistedJobs).toHaveBeenCalledWith('C:/user/queue.json');
    expect(h.jobs.size).toBe(0);
    expect(h.queueOrder).toEqual([]);
    expect(h.loggerInfo).not.toHaveBeenCalled();
    expect(h.pump).toHaveBeenCalled();
  });

  it('drops completed and cancelled jobs', async () => {
    h.loadPersistedJobs.mockResolvedValue([
      task({ id: 'done', status: 'completed' }),
      task({ id: 'cancelled', status: 'cancelled' }),
      task({ id: 'pending', status: 'pending' })
    ]);

    await restoreDownloadQueue();

    expect([...h.jobs.keys()]).toEqual(['pending']);
    expect(h.pump).toHaveBeenCalled();
  });

  it('resumes interrupted downloads as paused without errors', async () => {
    h.loadPersistedJobs.mockResolvedValue([
      task({
        id: 'downloading',
        status: 'downloading',
        progress: 50,
        speed: '1 MB/s',
        eta: '10s',
        completedAt: 123,
        error: 'old',
        outputDir: 'D:/out'
      })
    ]);

    await restoreDownloadQueue();

    expect(h.jobs.get('downloading')).toMatchObject({
      status: 'paused',
      progress: 0,
      speed: '',
      eta: '',
      completedAt: undefined,
      error: undefined,
      outputDir: 'D:/out'
    });
    expect(h.queueOrder).toEqual([]);
  });

  it('requeues pending jobs in order and keeps their errors', async () => {
    h.loadPersistedJobs.mockResolvedValue([
      task({ id: 'a', status: 'pending' }),
      task({ id: 'b', status: 'error', error: 'failed' }),
      task({ id: 'c', status: 'paused', error: 'ignored' }),
      task({ id: 'd', status: 'pending' })
    ]);

    await restoreDownloadQueue();

    expect(h.queueOrder).toEqual(['a', 'd']);
    expect(h.jobs.get('b')).toMatchObject({ status: 'error', error: 'failed' });
    expect(h.jobs.get('c')).toMatchObject({ status: 'paused', error: undefined });
    expect(h.loggerInfo).toHaveBeenCalledWith('downloads', 'restored 4 queued jobs');
  });

  it('keeps safe output directories and clears unsafe ones', async () => {
    h.isAllowedDownloadDir.mockImplementation(
      (dir: string) => dir !== 'C:/unsafe' && dir !== 'D:/resolved-unsafe'
    );
    h.resolveOutputDir.mockImplementation((job: { outputDir?: string }) =>
      job.outputDir === 'D:/unsafe-resolve' ? 'D:/resolved-unsafe' : `resolved:${job.outputDir}`
    );
    h.loadPersistedJobs.mockResolvedValue([
      task({ id: 'safe', outputDir: 'D:/safe' }),
      task({ id: 'unsafe', outputDir: 'C:/unsafe' }),
      task({ id: 'resolved-unsafe', outputDir: 'D:/unsafe-resolve' }),
      task({ id: 'empty', outputDir: '' }),
      task({ id: 'missing' })
    ]);

    await restoreDownloadQueue();

    expect(h.jobs.get('safe')!.outputDir).toBe('D:/safe');
    expect(h.jobs.get('unsafe')!.outputDir).toBe('');
    expect(h.jobs.get('resolved-unsafe')!.outputDir).toBe('');
    expect(h.jobs.get('empty')!.outputDir).toBe('');
    expect(h.jobs.get('missing')!.outputDir).toBe('');
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'dropped unsafe outputDir from persisted job unsafe: C:/unsafe'
    );
    expect(h.loggerWarn).toHaveBeenCalledWith(
      'downloads',
      'dropped unsafe outputDir from persisted job resolved-unsafe: D:/unsafe-resolve'
    );
  });

  it('rejects when persisted jobs cannot be read', async () => {
    h.loadPersistedJobs.mockRejectedValueOnce(new Error('corrupt'));
    await expect(restoreDownloadQueue()).rejects.toThrow('corrupt');
    expect(h.pump).not.toHaveBeenCalled();
  });
});
