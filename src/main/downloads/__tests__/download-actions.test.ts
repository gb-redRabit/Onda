import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcDownloadJobInput, IpcDownloadTask } from '../../../shared/types/ipc';
import {
  addDownloadJobs,
  cancelDownloadJob,
  clearFinishedDownloads,
  exportQueue,
  importQueue,
  listDownloadJobs,
  moveDownload,
  moveDownloadToFront,
  pauseAllDownloads,
  pauseDownloadJob,
  resumeAllDownloads,
  resumeDownloadJob,
  retryCoverProcessing
} from '../download-actions';

const state = vi.hoisted(() => ({
  jobs: new Map<string, any>(),
  queue: [] as string[],
  abort: new Map<string, any>(),
  collectPersistable: vi.fn(),
  forgetJob: vi.fn(),
  markQueueDirty: vi.fn(),
  persist: vi.fn(),
  pump: vi.fn(),
  runCoverStep: vi.fn(),
  kill: vi.fn(),
  resolveOutputDir: vi.fn((job: any) => `${job.outputDir}/resolved`),
  isAllowedDownloadDir: vi.fn(() => true),
  normalizeCover: vi.fn((cover: unknown) => cover as any),
  buildJobSource: vi.fn((source: any) => (source ? { ...source } : null)),
  resolveProvider: vi.fn(() => true),
  isSafeAbsolutePath: vi.fn(() => true),
  isProtectedPath: vi.fn(() => false),
  privateNetworkAllowed: vi.fn(() => true),
  trusted: new Map<string, string>(),
  snapshot: vi.fn((job: any) => ({ ...job })),
  loggerInfo: vi.fn(),
  uuid: 0
}));

vi.mock('crypto', () => ({
  randomUUID: () => `job-${++state.uuid}`
}));
vi.mock('../../../shared/logger', () => ({
  logger: { info: state.loggerInfo, warn: vi.fn(), error: vi.fn() }
}));
vi.mock('../download-helpers', () => ({
  resolveOutputDir: state.resolveOutputDir,
  isAllowedDownloadDir: state.isAllowedDownloadDir
}));
vi.mock('../download-snapshot', () => ({ snapshotDownloadTask: state.snapshot }));
vi.mock('../cover-spec', () => ({ normalizeCoverSpec: state.normalizeCover }));
vi.mock('../download-source', () => ({ buildJobSource: state.buildJobSource }));
vi.mock('../../../shared/provider', () => ({ resolveProvider: state.resolveProvider }));
vi.mock('../../utils/validate', () => ({ isSafeAbsolutePath: state.isSafeAbsolutePath }));
vi.mock('../../path-policy', () => ({ isProtectedPath: state.isProtectedPath }));
vi.mock('../../ipc/network-target', () => ({
  privateNetworkAllowedForTarget: state.privateNetworkAllowed
}));
vi.mock('../download-state', () => ({
  jobs: state.jobs,
  queueOrder: state.queue,
  jobAbortControllers: state.abort,
  collectPersistableJobs: state.collectPersistable,
  forgetJob: state.forgetJob,
  markQueueDirty: state.markQueueDirty,
  persist: state.persist
}));
vi.mock('../download-runner', () => ({ pump: state.pump }));
vi.mock('../download-post-process', () => ({ runCoverStep: state.runCoverStep }));
vi.mock('../kill-download-process', () => ({ killDownloadProcess: state.kill }));
vi.mock('../download-queue-restore', () => ({
  trustedPrivateNetworkOrigins: async () => state.trusted,
  restoreDownloadQueue: vi.fn()
}));

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: 'existing',
    url: 'https://example.com/video',
    title: 'Title',
    kind: 'audio',
    format: 'mp3',
    quality: 'best',
    progress: 0,
    speed: '',
    eta: '',
    status: 'pending',
    startedAt: 0,
    coverStatus: 'none',
    subtitleStatus: 'none',
    ...overrides
  } as any;
}

function input(overrides: Record<string, unknown> = {}): IpcDownloadJobInput {
  return {
    url: 'https://example.com/video',
    title: 'Video',
    ...overrides
  } as IpcDownloadJobInput;
}

beforeEach(() => {
  state.jobs.clear();
  state.queue.length = 0;
  state.abort.clear();
  state.uuid = 0;
  state.trusted = new Map();
  state.collectPersistable.mockReset();
  state.collectPersistable.mockReturnValue([{ id: 'x' }]);
  state.forgetJob.mockReset();
  state.markQueueDirty.mockReset();
  state.persist.mockReset();
  state.pump.mockReset();
  state.runCoverStep.mockReset();
  state.runCoverStep.mockResolvedValue(undefined);
  state.kill.mockReset();
  state.resolveOutputDir.mockReset();
  state.resolveOutputDir.mockImplementation((j: any) => `${j.outputDir}/resolved`);
  state.isAllowedDownloadDir.mockReset();
  state.isAllowedDownloadDir.mockReturnValue(true);
  state.normalizeCover.mockReset();
  state.normalizeCover.mockImplementation((cover: unknown) => cover as any);
  state.buildJobSource.mockReset();
  state.buildJobSource.mockImplementation((source: any) => (source ? { ...source } : null));
  state.resolveProvider.mockReset();
  state.resolveProvider.mockReturnValue(true);
  state.isSafeAbsolutePath.mockReset();
  state.isSafeAbsolutePath.mockReturnValue(true);
  state.isProtectedPath.mockReset();
  state.isProtectedPath.mockReturnValue(false);
  state.privateNetworkAllowed.mockReset();
  state.privateNetworkAllowed.mockReturnValue(true);
  state.snapshot.mockReset();
  state.snapshot.mockImplementation((j: any) => ({ ...j }));
  state.loggerInfo.mockReset();
});

describe('addDownloadJobs', () => {
  it('rejects empty and unsupported inputs', async () => {
    state.resolveProvider.mockReturnValue(false);
    expect(await addDownloadJobs([null as never, {} as never, input()])).toEqual([]);
    expect(state.queue).toEqual([]);
  });

  it('creates a job with defaults and queue state', async () => {
    const created = await addDownloadJobs([input()]);

    expect(created).toHaveLength(1);
    const createdJob = created[0] as any;
    expect(createdJob.id).toBe('job-1');
    expect(createdJob).toMatchObject({
      kind: 'audio',
      format: 'mp3',
      quality: 'best',
      status: 'pending',
      progress: 0,
      subsFormat: 'srt',
      subsMode: 'best',
      videoContainer: 'mp4',
      sponsorBlock: 'off'
    });
    expect(state.jobs.get('job-1')).toBeTruthy();
    expect(state.queue).toEqual(['job-1']);
    expect(state.markQueueDirty).toHaveBeenCalled();
    expect(state.pump).toHaveBeenCalled();
  });

  it('accepts http, SoundCloud, provider and explicit yt-dlp sources without provider detection', async () => {
    state.resolveProvider.mockReturnValue(false);
    const created = await addDownloadJobs([
      input({ url: 'https://a', source: { mode: 'http' } as never }),
      input({ url: 'https://b', source: { mode: 'soundcloud' } as never }),
      input({ url: 'https://c', source: { mode: 'ytdlp' } as never })
    ]);
    expect(created).toHaveLength(3);
  });

  it('deduplicates known jobs and replaces failed ones', async () => {
    state.jobs.set('pending', job({ id: 'pending', videoId: 'v1', url: 'https://x' }));
    state.queue.push('pending');
    expect(await addDownloadJobs([input({ url: 'https://x', videoId: 'v1' })])).toEqual([]);

    state.jobs.set(
      'failed',
      job({ id: 'failed', videoId: 'v2', status: 'error', url: 'https://y' })
    );
    state.queue.push('failed');
    const created = await addDownloadJobs([input({ url: 'https://y', videoId: 'v2' })]);

    expect(created).toHaveLength(1);
    expect(state.queue).not.toContain('failed');
    expect(state.forgetJob).toHaveBeenCalledWith('failed');
    expect(state.markQueueDirty).toHaveBeenCalled();
  });

  it('deduplicates provider items', async () => {
    state.jobs.set(
      'p',
      job({
        id: 'p',
        url: 'https://provider/1',
        source: {
          mode: 'provider',
          providerRef: { provider: 'mega', shareId: 'share' },
          providerItemId: 'item'
        }
      })
    );
    const created = await addDownloadJobs([
      input({
        url: 'https://provider/1',
        source: {
          mode: 'provider',
          providerRef: { provider: 'mega', shareId: 'share' },
          providerItemId: 'item'
        } as never
      })
    ]);
    expect(created).toEqual([]);
  });

  it('computes trusted private network access safely', async () => {
    state.trusted.set('src-1', 'https://origin');
    let created = await addDownloadJobs([
      input({
        url: 'https://origin/file',
        source: { mode: 'http', sourceId: 'src-1' } as never
      })
    ]);
    expect(created[0].source).toMatchObject({ allowPrivateNetwork: true });
    expect(state.privateNetworkAllowed).toHaveBeenCalledWith(
      'https://origin/file',
      'https://origin',
      true
    );

    state.privateNetworkAllowed.mockImplementation(() => {
      throw new Error('bad url');
    });
    created = await addDownloadJobs([
      input({ url: 'bad', source: { mode: 'http', sourceId: 'src-1' } as never })
    ]);
    expect(created[0].source).toMatchObject({ allowPrivateNetwork: false });
  });

  it('drops thumbnail covers for source jobs only', async () => {
    state.normalizeCover.mockReturnValue({ type: 'thumbnail' });

    let created = await addDownloadJobs([input({ source: { mode: 'http' } as never })]);
    expect(created[0].cover).toBeUndefined();

    created = await addDownloadJobs([input({ url: 'https://other' })]);
    expect(created[0].cover).toEqual({ type: 'thumbnail' });
  });

  it('validates and resolves the output directory', async () => {
    let created = await addDownloadJobs([input({ outputDir: 'C:/out', channelTitle: 'Channel' })]);
    expect(state.resolveOutputDir).toHaveBeenCalled();
    expect(created[0].outputDir).toBe('C:/out');

    state.isAllowedDownloadDir.mockReturnValueOnce(true).mockReturnValueOnce(false);
    created = await addDownloadJobs([input({ outputDir: 'C:/out' })]);
    expect(created[0].outputDir).toBe('');
  });

  it('rejects unsafe or protected output directories', async () => {
    state.isSafeAbsolutePath.mockReturnValue(false);
    let created = await addDownloadJobs([input({ outputDir: 'bad' })]);
    expect(created[0].outputDir).toBe('');

    state.isSafeAbsolutePath.mockReturnValue(true);
    state.isProtectedPath.mockReturnValue(true);
    created = await addDownloadJobs([input({ outputDir: 'C:/Windows' })]);
    expect(created[0].outputDir).toBe('');
  });

  it('normalizes optional job fields', async () => {
    const created = await addDownloadJobs([
      input({
        kind: 'video',
        format: 'mp4',
        quality: '720',
        filenameTemplate: '',
        subsFormat: 'vtt',
        subsMode: 'auto',
        subsFolder: 1,
        videoContainer: 'webm',
        sponsorBlock: 'remove',
        trimStart: 10,
        trimEnd: -1,
        addToLibrary: 1,
        audioLanguage: 'en'
      } as never)
    ]);
    expect(created[0]).toMatchObject({
      kind: 'video',
      format: 'mp4',
      filenameTemplate: '{title} - {artist}',
      subsFormat: 'vtt',
      subsMode: 'auto',
      subsFolder: true,
      videoContainer: 'webm',
      sponsorBlock: 'remove',
      trimStart: 10,
      trimEnd: undefined,
      addToLibrary: true
    });
  });
});

describe('cancel, pause and resume', () => {
  it('returns false for unknown jobs', () => {
    expect(cancelDownloadJob('x')).toBe(false);
    expect(pauseDownloadJob('x')).toBe(false);
    expect(resumeDownloadJob('x')).toBe(false);
  });

  it('cancels pending and paused jobs', () => {
    state.jobs.set('p', job({ id: 'p', status: 'pending' }));
    state.queue.push('p');
    expect(cancelDownloadJob('p')).toBe(true);
    expect(state.queue).toEqual([]);
    expect(state.jobs.get('p').status).toBe('cancelled');
    expect(state.persist).toHaveBeenCalled();

    state.jobs.set('q', job({ id: 'q', status: 'paused' }));
    expect(cancelDownloadJob('q')).toBe(true);
    expect(state.jobs.get('q').status).toBe('cancelled');
  });

  it('cancels downloading jobs via process or abort controller', () => {
    const child = {};
    state.jobs.set('a', job({ id: 'a', status: 'downloading', child }));
    expect(cancelDownloadJob('a')).toBe(true);
    expect(state.kill).toHaveBeenCalledWith(child);

    const abort = { abort: vi.fn() };
    state.jobs.set('b', job({ id: 'b', status: 'downloading' }));
    state.abort.set('b', abort);
    expect(cancelDownloadJob('b')).toBe(true);
    expect(abort.abort).toHaveBeenCalled();

    state.jobs.set('c', job({ id: 'c', status: 'downloading' }));
    expect(cancelDownloadJob('c')).toBe(false);
  });

  it('pauses pending and downloading jobs', () => {
    state.jobs.set('p', job({ id: 'p', status: 'pending' }));
    state.queue.push('p');
    expect(pauseDownloadJob('p')).toBe(true);
    expect(state.queue).toEqual([]);
    expect(state.jobs.get('p').status).toBe('paused');

    state.jobs.set('d', job({ id: 'd', status: 'downloading', child: {} }));
    expect(pauseDownloadJob('d')).toBe(true);
    expect(state.kill).toHaveBeenCalled();

    state.kill.mockImplementationOnce(() => {
      throw new Error('gone');
    });
    state.jobs.set('e', job({ id: 'e', status: 'downloading', child: {} }));
    expect(pauseDownloadJob('e')).toBe(true);

    const abort = { abort: vi.fn() };
    state.jobs.set('f', job({ id: 'f', status: 'downloading' }));
    state.abort.set('f', abort);
    expect(pauseDownloadJob('f')).toBe(true);
    expect(abort.abort).toHaveBeenCalled();

    state.jobs.set('g', job({ id: 'g', status: 'downloading' }));
    expect(pauseDownloadJob('g')).toBe(false);
  });

  it('resumes only paused jobs', () => {
    state.jobs.set('done', job({ id: 'done', status: 'completed' }));
    expect(resumeDownloadJob('done')).toBe(false);

    state.jobs.set('p', job({ id: 'p', status: 'paused', error: 'old' }));
    expect(resumeDownloadJob('p')).toBe(true);
    expect(state.jobs.get('p')).toMatchObject({ status: 'pending', error: undefined });
    expect(state.queue).toContain('p');
    expect(state.pump).toHaveBeenCalled();
  });
});

describe('cover retry', () => {
  it('validates the job and cover state', async () => {
    expect(await retryCoverProcessing('missing')).toEqual({
      success: false,
      error: 'task not found'
    });

    state.jobs.set('p', job({ url: 'x', id: 'p', status: 'pending' }));
    expect((await retryCoverProcessing('p')).error).toBe('task not completed');

    state.jobs.set(
      'done',
      job({ id: 'done', status: 'completed', outputPath: 'C:/out.mp3', cover: { type: 'none' } })
    );
    expect((await retryCoverProcessing('done')).error).toBe('cover cannot be retried');

    state.jobs.get('done').cover = { type: 'thumbnail' };
    expect((await retryCoverProcessing('done')).error).toBe('cover cannot be retried');
  });

  it('runs the cover step and reports its result', async () => {
    const target = job({
      id: 'done',
      status: 'completed',
      outputPath: 'C:/out.mp3',
      cover: { type: 'custom' },
      coverStatus: 'done',
      coverError: 'old'
    });
    state.jobs.set('done', target);

    expect(await retryCoverProcessing('done')).toEqual({ success: true });
    expect(state.runCoverStep).toHaveBeenCalledWith(target);
    expect(target.coverError).toBeUndefined();

    target.coverStatus = 'error';
    state.runCoverStep.mockImplementationOnce(async (j: any) => {
      j.coverStatus = 'error';
      j.coverError = 'cover failed';
    });
    expect(await retryCoverProcessing('done')).toEqual({
      success: false,
      error: 'cover failed'
    });
  });
});

describe('bulk controls', () => {
  it('pauses all waiting and running jobs', () => {
    state.jobs.set('p', job({ id: 'p', status: 'pending' }));
    state.jobs.set('d', job({ id: 'd', status: 'downloading', child: {} }));
    state.jobs.set('h', job({ id: 'h', status: 'downloading' }));
    const abort = { abort: vi.fn() };
    state.abort.set('h', abort);
    state.queue.push('p', 'd');

    expect(pauseAllDownloads()).toBe(true);
    expect(state.queue).toEqual([]);
    expect(state.jobs.get('p').status).toBe('paused');
    expect(state.kill).toHaveBeenCalled();
    expect(abort.abort).toHaveBeenCalled();
    expect(state.pump).not.toHaveBeenCalled();
  });

  it('returns false when nothing can be paused or resumed', () => {
    state.jobs.set('done', job({ id: 'done', status: 'completed' }));
    expect(pauseAllDownloads()).toBe(false);
    expect(resumeAllDownloads()).toBe(false);
  });

  it('resumes all paused jobs', () => {
    state.jobs.set('a', job({ id: 'a', status: 'paused', error: 'e' }));
    state.jobs.set('b', job({ id: 'b', status: 'paused' }));

    expect(resumeAllDownloads()).toBe(true);
    expect(state.queue).toEqual(['a', 'b']);
    expect(state.jobs.get('a').error).toBeUndefined();
    expect(state.pump).toHaveBeenCalled();
  });

  it('moves pending jobs to the front and swaps neighbours', () => {
    state.jobs.set('a', job({ id: 'a', status: 'pending' }));
    state.jobs.set('b', job({ id: 'b', status: 'pending' }));
    state.queue.push('a', 'b');

    expect(moveDownloadToFront('b')).toBe(true);
    expect(state.queue).toEqual(['b', 'a']);

    expect(moveDownload('b', 1)).toBe(true);
    expect(state.queue).toEqual(['a', 'b']);

    expect(moveDownload('a', -1)).toBe(false);
    expect(moveDownload('missing', 1)).toBe(false);

    state.jobs.set('done', job({ id: 'done', status: 'completed' }));
    expect(moveDownloadToFront('done')).toBe(false);
    expect(moveDownload('done', 1)).toBe(false);
  });
});

describe('listing, import, export and clearing', () => {
  it('lists and exports snapshots', () => {
    state.jobs.set('a', job({ id: 'a' }));
    state.jobs.set('b', job({ id: 'b' }));
    expect(listDownloadJobs()).toEqual([
      expect.objectContaining({ id: 'a' }),
      expect.objectContaining({ id: 'b' })
    ]);
    expect(exportQueue()).toEqual([{ id: 'x' }]);
  });

  it('imports eligible tasks and skips invalid or finished ones', async () => {
    const tasks: IpcDownloadTask[] = [
      { url: 'https://a', title: 'A', status: 'pending' } as never,
      { url: 'https://b', status: 'completed' } as never,
      { url: 'https://c', status: 'cancelled' } as never,
      { status: 'pending' } as never,
      { url: 'https://d', status: 'pending' } as never
    ];
    state.resolveProvider.mockImplementation(((url: string) => url !== 'https://d') as never);

    const count = await importQueue(tasks);

    expect(count).toBe(1);
    expect(state.queue).toHaveLength(1);
    expect(state.jobs.size).toBe(1);
  });

  it('clears finished jobs', () => {
    state.jobs.set('done', job({ id: 'done', status: 'completed' }));
    state.jobs.set('error', job({ id: 'error', status: 'error' }));
    state.jobs.set('cancelled', job({ id: 'cancelled', status: 'cancelled' }));
    state.jobs.set('pending', job({ id: 'pending', status: 'pending' }));
    state.queue.push('done', 'pending');

    expect(clearFinishedDownloads()).toBe(true);
    expect(state.jobs.has('done')).toBe(false);
    expect(state.jobs.has('error')).toBe(false);
    expect(state.jobs.has('cancelled')).toBe(false);
    expect(state.jobs.has('pending')).toBe(true);
    expect(state.queue).toEqual(['pending']);
    expect(state.loggerInfo).toHaveBeenCalledWith('downloads', 'cleared finished jobs');
    expect(state.markQueueDirty).toHaveBeenCalled();

    expect(clearFinishedDownloads()).toBe(false);
  });
});
