import { describe, it, expect, vi, beforeEach } from 'vitest';

// Siatka regresyjna dla „ponów okładkę": `retryCoverProcessing` ponownie uruchamia
// krok okładki (`runCoverStep` → `processCover`) na ukończonym zadaniu bez ponownego
// pobierania pliku, a także poprawnie odrzuca zadania/okładki niekwalifikujące się.

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
vi.mock('../../ipc/network-target', () => ({
  privateNetworkAllowedForTarget: vi.fn(() => false)
}));
vi.mock('../cover-processing', () => ({
  applyMetadataOverride: vi.fn(async () => {}),
  processCover: vi.fn(),
  removeThumbnailFiles: vi.fn(async () => {})
}));

import { retryCoverProcessing } from '../download-actions';
import { jobs } from '../download-state';
import { processCover } from '../cover-processing';
import type { Job } from '../download-helpers';

function completedJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    url: 'https://www.youtube.com/watch?v=abc12345678',
    title: 'T',
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    outputDir: '',
    filenameTemplate: '{title}',
    progress: 100,
    speed: '',
    eta: '',
    status: 'completed',
    startedAt: 0,
    outputPath: 'C:/media/song.mp3',
    cover: { type: 'frame', frameTime: 30 },
    coverStatus: 'error',
    coverError: 'previous failure',
    ...overrides
  };
}

beforeEach(() => {
  jobs.clear();
  vi.clearAllMocks();
});

describe('retryCoverProcessing', () => {
  it('re-runs the cover step and clears the error on success', async () => {
    jobs.set('job-1', completedJob());
    vi.mocked(processCover).mockResolvedValueOnce({ status: 'embedded' });

    const res = await retryCoverProcessing('job-1');

    expect(res).toEqual({ success: true });
    expect(processCover).toHaveBeenCalledTimes(1);
    const job = jobs.get('job-1');
    expect(job?.coverStatus).toBe('embedded');
    expect(job?.coverError).toBeUndefined();
  });

  it('reports the failure and keeps the error message', async () => {
    jobs.set('job-1', completedJob());
    vi.mocked(processCover).mockResolvedValueOnce({ status: 'error', error: 'boom' });

    const res = await retryCoverProcessing('job-1');

    expect(res).toEqual({ success: false, error: 'boom' });
    expect(processCover).toHaveBeenCalledTimes(1);
    expect(jobs.get('job-1')?.coverStatus).toBe('error');
    expect(jobs.get('job-1')?.coverError).toBe('boom');
  });

  it('rejects an unknown task', async () => {
    await expect(retryCoverProcessing('missing')).resolves.toEqual({
      success: false,
      error: 'task not found'
    });
    expect(processCover).not.toHaveBeenCalled();
  });

  it('rejects a task that is not completed', async () => {
    jobs.set('job-1', completedJob({ status: 'error' }));
    await expect(retryCoverProcessing('job-1')).resolves.toEqual({
      success: false,
      error: 'task not completed'
    });
    expect(processCover).not.toHaveBeenCalled();
  });

  it('rejects a task without an output path', async () => {
    jobs.set('job-1', completedJob({ outputPath: undefined }));
    await expect(retryCoverProcessing('job-1')).resolves.toEqual({
      success: false,
      error: 'task not completed'
    });
    expect(processCover).not.toHaveBeenCalled();
  });

  it('rejects a thumbnail cover (embedded by yt-dlp, not retryable)', async () => {
    jobs.set('job-1', completedJob({ cover: { type: 'thumbnail' } }));
    await expect(retryCoverProcessing('job-1')).resolves.toEqual({
      success: false,
      error: 'cover cannot be retried'
    });
    expect(processCover).not.toHaveBeenCalled();
  });

  it('rejects a task without a cover spec', async () => {
    jobs.set('job-1', completedJob({ cover: undefined }));
    await expect(retryCoverProcessing('job-1')).resolves.toEqual({
      success: false,
      error: 'cover cannot be retried'
    });
    expect(processCover).not.toHaveBeenCalled();
  });
});
