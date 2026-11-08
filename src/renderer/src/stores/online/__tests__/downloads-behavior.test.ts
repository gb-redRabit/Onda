import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  invoke: vi.fn(),
  notify: vi.fn(),
  uiThrows: false,
  emit: vi.fn(),
  hooksThrow: false,
  clonePlain: vi.fn((value: unknown) => JSON.parse(JSON.stringify(value))),
  toTask: vi.fn((task: any) => task),
  buildInput: vi.fn((task: any) => ({ input: task.id })),
  error: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('@renderer/i18n', () => ({ i18n: { global: { t: state.t } } }));
vi.mock('@shared/logger', () => ({
  logger: { error: state.error, info: vi.fn(), warn: vi.fn() }
}));
vi.mock('@renderer/stores/ui', () => ({
  useUIStore: () => {
    if (state.uiThrows) throw new Error('no ui');
    return { notify: state.notify };
  }
}));
vi.mock('@renderer/utils/clone', () => ({ clonePlain: state.clonePlain }));
vi.mock('@renderer/utils/pluginHooks', () => ({
  pluginHookBus: {
    emit: (...args: unknown[]) => {
      if (state.hooksThrow) throw new Error('no plugins');
      state.emit(...args);
    }
  }
}));
vi.mock('@renderer/utils/onlineDownloadTask', () => ({ toDownloadTask: state.toTask }));
vi.mock('@renderer/utils/onlineJob', () => ({ buildTaskInput: state.buildInput }));

async function load() {
  const { createOnlineDownloads } = await import('../downloads');
  return createOnlineDownloads;
}

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Task ${id}`,
    videoId: `v-${id}`,
    channelId: 'ch1',
    status: 'pending',
    url: 'https://youtube.com/watch?v=1',
    ...overrides
  } as any;
}

beforeEach(() => {
  state.invoke.mockReset();
  state.invoke.mockResolvedValue([]);
  state.notify.mockReset();
  state.uiThrows = false;
  state.emit.mockReset();
  state.hooksThrow = false;
  state.clonePlain.mockClear();
  state.toTask.mockClear();
  state.buildInput.mockClear();
  state.error.mockReset();
  state.t.mockClear();
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

describe('task map and lookups', () => {
  it('maps tasks by video id and ignores tasks without one', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a'));
    dl.upsertTask(task('b', { videoId: '' }));
    expect(dl.downloadByVideoId.value.get('v-a')).toMatchObject({ id: 'a' });
    expect(dl.downloadByVideoId.value.has('')).toBe(false);
    expect(dl.downloads.value).toHaveLength(2);
  });

  it('reports status and cover status with guards', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'downloading', coverStatus: 'fetching' }));

    expect(dl.downloadStatusFor('v-a')).toBe('downloading');
    expect(dl.downloadStatusFor('missing')).toBeNull();
    expect(dl.downloadStatusFor('')).toBeNull();
    expect(dl.coverStatusFor('v-a')).toBe('fetching');
    expect(dl.coverStatusFor('missing')).toBeNull();
    expect(dl.coverStatusFor('')).toBeNull();

    dl.upsertTask(task('b', { coverStatus: undefined }));
    expect(dl.coverStatusFor('v-b')).toBeNull();
  });
});

describe('upsertTask transitions', () => {
  it('updates existing tasks in place and appends new ones', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'pending' }));
    dl.upsertTask(task('b'));
    dl.upsertTask(task('a', { status: 'downloading', title: 'Updated' }));
    expect(dl.downloads.value.map((t) => t.id)).toEqual(['a', 'b']);
    expect(dl.downloads.value[0]).toMatchObject({ status: 'downloading', title: 'Updated' });
  });

  it('marks completed downloads once and emits completion hooks', async () => {
    const create = await load();
    const mark = vi.fn();
    const dl = create(mark);
    dl.upsertTask(task('a', { status: 'downloading' }));
    state.emit.mockClear();

    dl.upsertTask(task('a', { status: 'completed', outputPath: 'C:/out/a.mp3' }));
    expect(mark).toHaveBeenCalledWith('v-a', 'ch1');
    expect(state.emit).toHaveBeenCalledWith('download:complete', {
      id: 'a',
      title: 'Task a',
      url: 'https://youtube.com/watch?v=1',
      outputPath: 'C:/out/a.mp3'
    });

    dl.upsertTask(task('a', { status: 'completed' }));
    expect(mark).toHaveBeenCalledTimes(1);
    expect(state.emit.mock.calls.filter((call) => call[0] === 'download:complete')).toHaveLength(1);
  });

  it('does not mark completed tasks without a video or channel id', async () => {
    const create = await load();
    const mark = vi.fn();
    const dl = create(mark);
    dl.upsertTask(task('a', { videoId: '', status: 'completed' }));
    dl.upsertTask(task('b', { channelId: '', status: 'completed' }));
    expect(mark).not.toHaveBeenCalled();
  });

  it('notifies on the first error transition only', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'downloading' }));
    dl.upsertTask(task('a', { status: 'error', error: 'boom' }));
    expect(state.notify).toHaveBeenCalledWith('error', 'Task a', 'boom');

    dl.upsertTask(task('a', { status: 'error', error: 'boom' }));
    expect(state.notify).toHaveBeenCalledTimes(1);
    expect(state.emit).toHaveBeenCalledWith('download:error', {
      id: 'a',
      title: 'Task a',
      url: 'https://youtube.com/watch?v=1',
      error: 'boom',
      errorCode: undefined
    });
  });

  it('skips notifications for errors without a message', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'error' }));
    expect(state.notify).not.toHaveBeenCalled();
  });

  it('tolerates missing stores and plugin hooks', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.uiThrows = true;
    state.hooksThrow = true;
    expect(() => dl.upsertTask(task('a', { status: 'error', error: 'x' }))).not.toThrow();
    expect(() => dl.upsertTask(task('b', { status: 'downloading' }))).not.toThrow();
  });

  it('emits download start with the platform', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'downloading', source: 'pikpak' }));
    expect(state.emit).toHaveBeenCalledWith('download:start', {
      id: 'a',
      url: 'https://youtube.com/watch?v=1',
      title: 'Task a',
      platform: 'pikpak',
      format: undefined,
      quality: undefined
    });

    state.emit.mockClear();
    dl.upsertTask(task('b', { status: 'downloading' }));
    expect(state.emit.mock.calls[0][1]).toMatchObject({ platform: undefined });
  });
});

describe('submitting and loading', () => {
  it('clones inputs, sends them and upserts created tasks', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockResolvedValueOnce([task('a'), task('b')]);
    const created = await dl.submitJobs([{ url: 'u', title: 't' }] as never);

    expect(state.clonePlain).toHaveBeenCalled();
    expect(state.invoke).toHaveBeenCalledWith('yt:download:add', [{ url: 'u', title: 't' }]);
    expect(created.map((t) => t.id)).toEqual(['a', 'b']);
    expect(dl.downloads.value).toHaveLength(2);
  });

  it('handles empty responses and IPC failures', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockResolvedValueOnce(undefined);
    await expect(dl.submitJobs([{ url: 'u' }] as never)).resolves.toEqual([]);

    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await expect(dl.submitJobs([{ url: 'u' }] as never)).resolves.toEqual([]);
    expect(state.error).toHaveBeenCalledWith(
      'yt',
      '[submitJobs] yt:download:add FAILED',
      expect.any(Error)
    );
  });

  it('loads task lists and ignores invalid responses', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockResolvedValueOnce([task('a')]);
    await dl.loadDownloads();
    expect(state.invoke).toHaveBeenCalledWith('yt:download:list');
    expect(dl.downloads.value).toHaveLength(1);

    state.invoke.mockResolvedValueOnce({ nope: true });
    await dl.loadDownloads();
    expect(dl.downloads.value).toHaveLength(1);

    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await expect(dl.loadDownloads()).resolves.toBeUndefined();
  });

  it('adds tasks through buildTaskInput', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockResolvedValueOnce([]);
    await dl.addTask(task('a'));
    expect(state.buildInput).toHaveBeenCalledWith(task('a'));
    expect(state.invoke).toHaveBeenCalledWith('yt:download:add', [{ input: 'a' }]);
  });
});

describe('task controls', () => {
  it('updates status optimistically after successful IPC', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'downloading' }));
    state.invoke.mockResolvedValue(true);

    await dl.cancelDownload('a');
    expect(state.invoke).toHaveBeenCalledWith('yt:download:cancel', 'a');
    expect(dl.downloads.value[0].status).toBe('cancelled');

    await dl.pauseDownload('a');
    expect(dl.downloads.value[0].status).toBe('paused');

    await dl.resumeDownload('a');
    expect(dl.downloads.value[0].status).toBe('pending');
  });

  it('leaves state untouched on refusal, missing ids and errors', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'downloading' }));
    state.invoke.mockResolvedValue(false);
    await dl.cancelDownload('a');
    await dl.pauseDownload('a');
    await dl.resumeDownload('a');
    expect(dl.downloads.value[0].status).toBe('downloading');

    state.invoke.mockResolvedValue(true);
    await dl.cancelDownload('missing');
    expect(dl.downloads.value).toHaveLength(1);

    state.invoke.mockRejectedValue(new Error('ipc'));
    await expect(dl.cancelDownload('a')).resolves.toBeUndefined();
    await expect(dl.pauseDownload('a')).resolves.toBeUndefined();
    await expect(dl.resumeDownload('a')).resolves.toBeUndefined();
  });

  it('retries downloads and removes the failed row', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'error' }));
    state.invoke.mockResolvedValueOnce([task('new')]);

    await dl.retryDownload(dl.downloads.value[0]);
    expect(state.buildInput).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(dl.downloads.value.map((t) => t.id)).toEqual(['new']);
  });

  it('notifies when a retry is still active', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'error' }));
    state.invoke.mockResolvedValueOnce([]);

    await dl.retryDownload(dl.downloads.value[0]);
    expect(state.notify).toHaveBeenCalledWith(
      'info',
      'downloads.retry',
      'youtube.retryAlreadyActive'
    );
    expect(dl.downloads.value).toHaveLength(1);
  });

  it('reverts cover state when the retry throws', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { coverStatus: 'error', coverError: 'boom' }));
    state.invoke.mockRejectedValueOnce(new Error('ipc'));

    await dl.retryCover(dl.downloads.value[0]);
    expect(dl.downloads.value[0]).toMatchObject({ coverStatus: 'error', coverError: 'boom' });
  });

  it('notifies with a translated error when the cover retry is rejected', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { coverStatus: 'error' }));
    state.invoke.mockResolvedValueOnce({ success: false, error: 'nope' });

    await dl.retryCover(dl.downloads.value[0]);
    expect(state.notify).toHaveBeenCalledWith('error', 'downloads.coverStatusError', 'nope');
  });

  it('retries covers for unknown tasks without touching the list', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockResolvedValueOnce({ success: true });
    await expect(dl.retryCover(task('missing'))).resolves.toBeUndefined();
    expect(state.invoke).toHaveBeenCalledWith('yt:download:retryCover', 'missing');
    expect(dl.downloads.value).toHaveLength(0);
  });
});

describe('queue operations', () => {
  it('forwards bulk and ordering commands', async () => {
    const create = await load();
    const dl = create(vi.fn());
    await dl.pauseAll();
    await dl.resumeAll();
    await dl.moveToFront('a');
    await dl.move('a', -1);
    await dl.scheduleStart(123);

    expect(state.invoke).toHaveBeenNthCalledWith(1, 'yt:download:pauseAll');
    expect(state.invoke).toHaveBeenNthCalledWith(2, 'yt:download:resumeAll');
    expect(state.invoke).toHaveBeenNthCalledWith(3, 'yt:download:moveToFront', 'a');
    expect(state.invoke).toHaveBeenNthCalledWith(4, 'yt:download:move', 'a', -1);
    expect(state.invoke).toHaveBeenNthCalledWith(5, 'yt:download:schedule', 123);
  });

  it('swallows failures of queue commands', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockRejectedValue(new Error('ipc'));
    await expect(dl.pauseAll()).resolves.toBeUndefined();
    await expect(dl.resumeAll()).resolves.toBeUndefined();
    await expect(dl.moveToFront('a')).resolves.toBeUndefined();
    await expect(dl.move('a', 1)).resolves.toBeUndefined();
    await expect(dl.scheduleStart(null)).resolves.toBeUndefined();
  });

  it('exports and imports the queue', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockResolvedValueOnce({ success: true });
    await expect(dl.exportQueue()).resolves.toEqual({ success: true });

    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await expect(dl.exportQueue()).resolves.toEqual({ success: false });

    state.invoke.mockResolvedValueOnce({ success: true, count: 2 });
    state.invoke.mockResolvedValueOnce([task('a')]);
    await expect(dl.importQueue()).resolves.toEqual({ success: true, count: 2 });
    expect(dl.downloads.value).toHaveLength(1);

    state.invoke.mockResolvedValueOnce({ success: false });
    await expect(dl.importQueue()).resolves.toEqual({ success: false });

    state.invoke.mockResolvedValueOnce(undefined);
    await expect(dl.importQueue()).resolves.toEqual({ success: false });

    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await expect(dl.importQueue()).resolves.toEqual({ success: false });
  });

  it('reads and updates schedules and metadata', async () => {
    const create = await load();
    const dl = create(vi.fn());
    state.invoke.mockResolvedValueOnce(999);
    await expect(dl.getScheduledStart()).resolves.toBe(999);
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await expect(dl.getScheduledStart()).resolves.toBeNull();

    state.invoke.mockResolvedValueOnce({ success: true });
    await expect(dl.updateMetadata('C:/a.mp3', { artist: 'A' })).resolves.toBe(true);
    state.invoke.mockResolvedValueOnce({ success: false });
    await expect(dl.updateMetadata('C:/a.mp3', {})).resolves.toBe(false);
    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await expect(dl.updateMetadata('C:/a.mp3', {})).resolves.toBe(false);
  });

  it('clears finished downloads and keeps active rows', async () => {
    const create = await load();
    const dl = create(vi.fn());
    dl.upsertTask(task('a', { status: 'completed' }));
    dl.upsertTask(task('b', { status: 'error' }));
    dl.upsertTask(task('c', { status: 'paused' }));
    dl.upsertTask(task('d', { status: 'downloading' }));
    state.invoke.mockResolvedValueOnce(undefined);

    await dl.clearFinishedDownloads();
    expect(state.invoke).toHaveBeenCalledWith('yt:download:clearFinished');
    expect(dl.downloads.value.map((t) => t.id)).toEqual(['c', 'd']);

    state.invoke.mockRejectedValueOnce(new Error('ipc'));
    await dl.clearFinishedDownloads();
    expect(dl.downloads.value.map((t) => t.id)).toEqual(['c', 'd']);
  });
});
