import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: any[]) => any>,
  fromWebContents: vi.fn(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
  add: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  retryCover: vi.fn(),
  clearFinished: vi.fn(),
  list: vi.fn(),
  setEmit: vi.fn(),
  restore: vi.fn(),
  pauseAll: vi.fn(),
  resumeAll: vi.fn(),
  toFront: vi.fn(),
  move: vi.fn(),
  exportQueue: vi.fn(),
  importQueue: vi.fn(),
  schedule: vi.fn(),
  getScheduled: vi.fn(),
  applyMeta: vi.fn(),
  safePath: vi.fn(),
  protectedPath: vi.fn(),
  broadcast: vi.fn(),
  e2e: false,
  e2eAdd: vi.fn(),
  e2eCancel: vi.fn(),
  e2ePause: vi.fn(),
  e2eResume: vi.fn(),
  e2eList: vi.fn(),
  e2eClear: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: any[]) => any) => {
      state.handlers[channel] = fn;
    }
  },
  BrowserWindow: { fromWebContents: state.fromWebContents },
  dialog: {
    showSaveDialog: state.showSaveDialog,
    showOpenDialog: state.showOpenDialog
  }
}));
vi.mock('fs/promises', () => ({
  writeFile: state.writeFile,
  readFile: state.readFile
}));
vi.mock('path', () => ({ dirname: (path: string) => path.slice(0, path.lastIndexOf('/')) }));
vi.mock('../../../downloads/download-manager', () => ({
  addDownloadJobs: state.add,
  cancelDownloadJob: state.cancel,
  pauseDownloadJob: state.pause,
  resumeDownloadJob: state.resume,
  retryCoverProcessing: state.retryCover,
  clearFinishedDownloads: state.clearFinished,
  listDownloadJobs: state.list,
  setDownloadEmit: state.setEmit,
  restoreDownloadQueue: state.restore,
  pauseAllDownloads: state.pauseAll,
  resumeAllDownloads: state.resumeAll,
  moveDownloadToFront: state.toFront,
  moveDownload: state.move,
  exportQueue: state.exportQueue,
  importQueue: state.importQueue,
  scheduleDownloadStart: state.schedule,
  getScheduledStart: state.getScheduled
}));
vi.mock('../../../downloads/cover-processing', () => ({
  applyMetadataOverride: state.applyMeta
}));
vi.mock('../../../utils/validate', () => ({ isSafeAbsolutePath: state.safePath }));
vi.mock('../../../path-policy', () => ({ isProtectedPath: state.protectedPath }));
vi.mock('../../../utils/broadcast', () => ({ broadcastToAllWindows: state.broadcast }));
vi.mock('../../../e2e-fixtures', () => ({
  e2eFixturesEnabled: () => state.e2e,
  e2eAddDownloadTasks: state.e2eAdd,
  e2eCancelDownloadTask: state.e2eCancel,
  e2ePauseDownloadTask: state.e2ePause,
  e2eResumeDownloadTask: state.e2eResume,
  e2eListDownloadTasks: state.e2eList,
  e2eClearFinishedDownloadTasks: state.e2eClear
}));
vi.mock('../../../../shared/logger', () => ({
  logger: { info: state.info, warn: state.warn, error: vi.fn() }
}));

async function load() {
  vi.resetModules();
  const module = await import('../downloads-handlers');
  module.registerDownloadHandlers();
  return state.handlers;
}

function task(id: string) {
  return { id, title: id } as any;
}

beforeEach(() => {
  vi.useFakeTimers();
  state.handlers = {};
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object' && 'mockReset' in value) {
      (value as { mockReset: () => void }).mockReset();
    }
  }
  state.e2e = false;
  state.fromWebContents.mockReturnValue({ id: 1 });
  state.showSaveDialog.mockResolvedValue({ canceled: false, filePath: 'C:/queue.json' });
  state.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['C:/queue.json'] });
  state.writeFile.mockResolvedValue(undefined);
  state.readFile.mockResolvedValue('{"version":1,"jobs":[]}');
  state.add.mockResolvedValue([task('a')]);
  state.cancel.mockReturnValue(true);
  state.pause.mockReturnValue(true);
  state.resume.mockReturnValue(true);
  state.retryCover.mockResolvedValue({ success: true });
  state.clearFinished.mockReturnValue(true);
  state.list.mockReturnValue([task('a')]);
  state.pauseAll.mockReturnValue(true);
  state.resumeAll.mockReturnValue(true);
  state.toFront.mockReturnValue(true);
  state.move.mockReturnValue(true);
  state.exportQueue.mockReturnValue([task('a')]);
  state.importQueue.mockResolvedValue(2);
  state.schedule.mockReturnValue(true);
  state.getScheduled.mockReturnValue(1234);
  state.applyMeta.mockResolvedValue(undefined);
  state.safePath.mockReturnValue(true);
  state.protectedPath.mockReturnValue(false);
  state.e2eAdd.mockResolvedValue([task('e2e')]);
  state.e2eCancel.mockReturnValue(true);
  state.e2ePause.mockReturnValue(true);
  state.e2eResume.mockReturnValue(true);
  state.e2eList.mockReturnValue([task('e2e')]);
  state.e2eClear.mockReturnValue(true);
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('registration and job actions', () => {
  it('registers handlers, sets the emitter and restores the queue', async () => {
    const h = await load();
    expect(state.setEmit).toHaveBeenCalled();
    expect(state.restore).toHaveBeenCalled();
    expect(Object.keys(h)).toEqual(
      expect.arrayContaining([
        'yt:download:add',
        'yt:download:cancel',
        'yt:download:pause',
        'yt:download:resume',
        'yt:download:list',
        'yt:download:clearFinished',
        'yt:download:pauseAll',
        'yt:download:resumeAll',
        'yt:download:moveToFront',
        'yt:download:move',
        'yt:download:export',
        'yt:download:import',
        'yt:download:schedule',
        'yt:download:schedule:get',
        'yt:download:updateMetadata',
        'yt:download:retryCover'
      ])
    );
  });

  it('routes add/cancel/pause/resume/list/clear to the manager', async () => {
    const h = await load();
    const jobs = [{ url: 'https://x', title: 'x' }];
    expect(await h['yt:download:add']({}, jobs)).toEqual([task('a')]);
    expect(state.add).toHaveBeenCalledWith(jobs);
    expect(await h['yt:download:cancel']({}, 'a')).toBe(true);
    expect(state.cancel).toHaveBeenCalledWith('a');
    expect(await h['yt:download:pause']({}, 'a')).toBe(true);
    expect(await h['yt:download:resume']({}, 'a')).toBe(true);
    expect(await h['yt:download:list']()).toEqual([task('a')]);
    expect(await h['yt:download:clearFinished']()).toBe(true);
    expect(state.info).toHaveBeenCalledWith('downloads', '[IPC yt:download:add] received 1 jobs');
  });

  it('routes to e2e fixtures when enabled', async () => {
    state.e2e = true;
    const h = await load();
    expect(await h['yt:download:add']({}, [{ url: 'u', title: 't' }])).toEqual([task('e2e')]);
    expect(await h['yt:download:cancel']({}, 'x')).toBe(true);
    expect(await h['yt:download:pause']({}, 'x')).toBe(true);
    expect(await h['yt:download:resume']({}, 'x')).toBe(true);
    expect(await h['yt:download:list']()).toEqual([task('e2e')]);
    expect(await h['yt:download:clearFinished']()).toBe(true);
    expect(state.add).not.toHaveBeenCalled();
  });

  it('handles bulk and ordering actions', async () => {
    const h = await load();
    expect(await h['yt:download:pauseAll']()).toBe(true);
    expect(await h['yt:download:resumeAll']()).toBe(true);
    expect(await h['yt:download:moveToFront']({}, 'a')).toBe(true);
    expect(await h['yt:download:move']({}, 'a', -1)).toBe(true);
    expect(state.move).toHaveBeenCalledWith('a', -1);
    expect(await h['yt:download:schedule']({}, 999)).toBe(true);
    expect(state.schedule).toHaveBeenCalledWith(999);
    await h['yt:download:schedule']({}, null);
    expect(state.schedule).toHaveBeenLastCalledWith(null);
    await h['yt:download:schedule']({}, 'bad');
    expect(state.schedule).toHaveBeenLastCalledWith(null);
    expect(await h['yt:download:schedule:get']()).toBe(1234);
  });
});

describe('export and import', () => {
  it('exports the queue to JSON', async () => {
    const h = await load();
    await expect(h['yt:download:export']({ sender: {} })).resolves.toEqual({ success: true });
    expect(state.writeFile).toHaveBeenCalledWith(
      'C:/queue.json',
      JSON.stringify({ version: 1, jobs: [task('a')] }, null, 2),
      'utf-8'
    );
  });

  it('handles export cancellation, windowless dialogs and failures', async () => {
    const h = await load();
    state.fromWebContents.mockReturnValue(null);
    await h['yt:download:export']({ sender: {} });
    expect(state.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Eksportuj kolejkę' })
    );

    state.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    await expect(h['yt:download:export']({ sender: {} })).resolves.toEqual({
      success: false,
      canceled: true
    });

    state.writeFile.mockRejectedValueOnce(new Error('disk'));
    await expect(h['yt:download:export']({ sender: {} })).resolves.toEqual({
      success: false,
      error: 'disk'
    });
  });

  it('imports queues from arrays and object payloads', async () => {
    const h = await load();
    state.readFile.mockResolvedValueOnce('{"version":1,"jobs":[{"id":"a"}]}');
    await expect(h['yt:download:import']({ sender: {} })).resolves.toEqual({
      success: true,
      count: 2
    });
    expect(state.importQueue).toHaveBeenCalledWith([{ id: 'a' }]);

    state.readFile.mockResolvedValueOnce('[{"id":"b"}]');
    await h['yt:download:import']({ sender: {} });
    expect(state.importQueue).toHaveBeenLastCalledWith([{ id: 'b' }]);

    state.readFile.mockResolvedValueOnce('{"jobs":"nope"}');
    await h['yt:download:import']({ sender: {} });
    expect(state.importQueue).toHaveBeenLastCalledWith([]);
  });

  it('handles import cancellation and errors', async () => {
    const h = await load();
    state.showOpenDialog.mockResolvedValueOnce({ canceled: true });
    await expect(h['yt:download:import']({ sender: {} })).resolves.toEqual({
      success: false,
      canceled: true
    });

    state.readFile.mockResolvedValueOnce('not json');
    const failed = await h['yt:download:import']({ sender: {} });
    expect(failed.success).toBe(false);
    expect(failed.error).toBeTruthy();
  });
});

describe('metadata and cover retries', () => {
  it('validates and applies metadata overrides', async () => {
    const h = await load();
    await expect(
      h['yt:download:updateMetadata']({}, 'C:/music/a.mp3', { artist: 'A' })
    ).resolves.toEqual({ success: true });
    expect(state.applyMeta).toHaveBeenCalledWith('C:/music/a.mp3', { artist: 'A' });

    state.safePath.mockReturnValueOnce(false);
    expect(await h['yt:download:updateMetadata']({}, 'relative/path.mp3', {})).toEqual({
      success: false,
      error: 'Invalid path'
    });

    expect(await h['yt:download:updateMetadata']({}, 5, {})).toEqual({
      success: false,
      error: 'Invalid path'
    });

    state.protectedPath.mockReturnValueOnce(true);
    expect(await h['yt:download:updateMetadata']({}, 'C:/Windows/a.mp3', {})).toEqual({
      success: false,
      error: 'Protected path'
    });

    state.protectedPath.mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(await h['yt:download:updateMetadata']({}, 'C:/Protected/a.mp3', {})).toEqual({
      success: false,
      error: 'Protected path'
    });

    state.applyMeta.mockRejectedValueOnce(new Error('tag fail'));
    expect(await h['yt:download:updateMetadata']({}, 'C:/music/a.mp3', {})).toEqual({
      success: false,
      error: 'tag fail'
    });
  });

  it('retries covers only for valid ids', async () => {
    const h = await load();
    expect(await h['yt:download:retryCover']({}, '')).toEqual({
      success: false,
      error: 'Invalid id'
    });
    expect(await h['yt:download:retryCover']({}, 5)).toEqual({
      success: false,
      error: 'Invalid id'
    });

    expect(await h['yt:download:retryCover']({}, 'a')).toEqual({ success: true });
    expect(state.retryCover).toHaveBeenCalledWith('a');
  });
});

describe('broadcast batching', () => {
  it('coalesces progress updates per task and flushes after the interval', async () => {
    const h = await load();
    const emit = state.setEmit.mock.calls[0][0];
    expect(typeof emit).toBe('function');

    emit({ id: 'a', progress: 10, title: 'A' });
    emit({ id: 'a', progress: 20, title: 'A' });
    emit({ id: 'b', progress: 5, title: 'B' });
    expect(state.broadcast).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(state.broadcast).toHaveBeenCalledTimes(2);
    expect(state.broadcast).toHaveBeenCalledWith('yt:downloadProgress', {
      id: 'a',
      progress: 20,
      title: 'A'
    });
    expect(state.broadcast).toHaveBeenCalledWith(
      'yt:downloadProgress',
      expect.objectContaining({ id: 'b' })
    );

    emit({ id: 'c', progress: 1 });
    await vi.advanceTimersByTimeAsync(200);
    expect(state.broadcast).toHaveBeenCalledTimes(3);
    expect(h['yt:download:add']).toBeTypeOf('function');
  });
});
