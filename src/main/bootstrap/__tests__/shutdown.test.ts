import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  on: vi.fn(),
  preventDefault: vi.fn(),
  quit: vi.fn(),
  unregisterAll: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  closeLogin: vi.fn(),
  closeProvider: vi.fn(),
  stopSubs: vi.fn(),
  stopLinkSubs: vi.fn(),
  flushLogs: vi.fn(),
  flushScanned: vi.fn(),
  flushStats: vi.fn(),
  flushPlayback: vi.fn(),
  flushQueue: vi.fn(),
  flushProvider: vi.fn(),
  flushCover: vi.fn(),
  flushStream: vi.fn(),
  stopWatcher: vi.fn(),
  cancelLoudness: vi.fn(),
  cancelConvert: vi.fn(),
  cancelJobs: vi.fn(),
  cancelBatch: vi.fn(),
  kill: vi.fn(),
  shutdownDiscord: vi.fn(),
  getStore: vi.fn(),
  store: null as any,
  extraRoots: vi.fn(() => ['D:/r1', 'D:/r2']),
  jobs: new Map<string, any>(),
  aborts: new Map<string, { abort: () => void }>(),
  getMediaServer: vi.fn()
}));

vi.mock('electron', () => ({
  app: { on: state.on, quit: state.quit },
  globalShortcut: { unregisterAll: state.unregisterAll }
}));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, error: state.loggerError, info: vi.fn() }
}));
vi.mock('../../ipc/cover/cover-cache', () => ({ getStore: state.getStore }));
vi.mock('../../media/media-server', () => ({ getExtraRoots: state.extraRoots }));
vi.mock('../../youtube/youtube-auth', () => ({ closeLoginWindow: state.closeLogin }));
vi.mock('../../ipc/providers/provider-login', () => ({
  closeProviderLoginWindow: state.closeProvider
}));
vi.mock('../../ipc/subscriptions/subscription-checker', () => ({
  stopSubscriptionChecker: state.stopSubs
}));
vi.mock('../../ipc/providers/remote-subs-checker', () => ({
  stopLinkSubsChecker: state.stopLinkSubs
}));
vi.mock('../../log-file', () => ({ flushLogWrites: state.flushLogs }));
vi.mock('../../ipc/library/library-store', () => ({
  flushLibraryScanned: state.flushScanned,
  flushStats: state.flushStats
}));
vi.mock('../../ipc/playback-handlers', () => ({
  flushPlaybackPositions: state.flushPlayback
}));
vi.mock('../../downloads/download-manager', () => ({ flushQueueNow: state.flushQueue }));
vi.mock('../../ipc/providers/provider-cache', () => ({
  flushProviderCache: state.flushProvider
}));
vi.mock('../../ipc/cover/cover-map', () => ({ flushCoverMapWrite: state.flushCover }));
vi.mock('../../ipc/youtube/youtube-stream-cache', () => ({
  flushStreamCache: state.flushStream
}));
vi.mock('../../ipc/library/library-watcher', () => ({ stopLibraryWatcher: state.stopWatcher }));
vi.mock('../../ipc/library/library-handlers', () => ({
  cancelLibraryLoudness: state.cancelLoudness
}));
vi.mock('../../tools/media-convert', () => ({ cancelAllMediaConvert: state.cancelConvert }));
vi.mock('../../tools/video-clip-job', () => ({ cancelAllMediaJobs: state.cancelJobs }));
vi.mock('../../tools/batch-images', () => ({ cancelAllBatchImages: state.cancelBatch }));
vi.mock('../../downloads/download-state', () => ({
  jobs: state.jobs,
  jobAbortControllers: state.aborts
}));
vi.mock('../../downloads/kill-download-process', () => ({
  killDownloadProcess: state.kill
}));
vi.mock('../../discord/rich-presence', () => ({ shutdownDiscord: state.shutdownDiscord }));

import { installGracefulShutdown } from '../shutdown';

const settle = async (rounds = 10) => {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
};

function install() {
  installGracefulShutdown({ getMediaServer: state.getMediaServer });
  return state.on.mock.calls.find(([event]) => event === 'before-quit')![1];
}

beforeEach(() => {
  vi.useFakeTimers();
  state.on.mockReset();
  state.preventDefault.mockReset();
  state.quit.mockReset();
  state.unregisterAll.mockReset();
  state.loggerWarn.mockReset();
  state.loggerError.mockReset();
  state.closeLogin.mockReset();
  state.closeProvider.mockReset();
  state.stopSubs.mockReset();
  state.stopLinkSubs.mockReset();
  state.flushLogs.mockReset();
  state.flushLogs.mockResolvedValue(undefined);
  state.flushScanned.mockReset();
  state.flushScanned.mockResolvedValue(undefined);
  state.flushStats.mockReset();
  state.flushStats.mockResolvedValue(undefined);
  state.flushPlayback.mockReset();
  state.flushPlayback.mockResolvedValue(undefined);
  state.flushQueue.mockReset();
  state.flushQueue.mockResolvedValue(undefined);
  state.flushProvider.mockReset();
  state.flushProvider.mockResolvedValue(undefined);
  state.flushCover.mockReset();
  state.flushCover.mockResolvedValue(undefined);
  state.flushStream.mockReset();
  state.stopWatcher.mockReset();
  state.cancelLoudness.mockReset();
  state.cancelConvert.mockReset();
  state.cancelJobs.mockReset();
  state.cancelBatch.mockReset();
  state.kill.mockReset();
  state.shutdownDiscord.mockReset();
  state.extraRoots.mockReset();
  state.extraRoots.mockReturnValue(['D:/r1', 'D:/r2']);
  state.store = { set: vi.fn(async () => undefined) };
  state.getStore.mockReset();
  state.getStore.mockResolvedValue(state.store);
  state.getMediaServer.mockReset();
  state.getMediaServer.mockReturnValue({ close: vi.fn() });
  state.jobs.clear();
  state.aborts.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('first quit', () => {
  it('stops background work, flushes state and quits', async () => {
    const handler = install();
    handler({ preventDefault: state.preventDefault });
    await settle();

    expect(state.preventDefault).toHaveBeenCalledTimes(1);
    expect(state.unregisterAll).toHaveBeenCalledTimes(1);
    expect(state.stopSubs).toHaveBeenCalledTimes(1);
    expect(state.stopLinkSubs).toHaveBeenCalledTimes(1);
    expect(state.stopWatcher).toHaveBeenCalledTimes(1);
    expect(state.cancelLoudness).toHaveBeenCalledTimes(1);
    expect(state.cancelConvert).toHaveBeenCalledTimes(1);
    expect(state.cancelJobs).toHaveBeenCalledTimes(1);
    expect(state.cancelBatch).toHaveBeenCalledTimes(1);
    expect(state.flushStream).toHaveBeenCalledTimes(1);
    expect(state.getMediaServer).toHaveBeenCalledTimes(1);
    expect(state.closeLogin).toHaveBeenCalledTimes(1);
    expect(state.closeProvider).toHaveBeenCalledTimes(1);
    expect(state.shutdownDiscord).toHaveBeenCalledTimes(1);
    expect(state.flushLogs).toHaveBeenCalledTimes(1);
    expect(state.flushScanned).toHaveBeenCalledTimes(1);
    expect(state.flushStats).toHaveBeenCalledTimes(1);
    expect(state.flushPlayback).toHaveBeenCalledTimes(1);
    expect(state.flushQueue).toHaveBeenCalledTimes(1);
    expect(state.flushProvider).toHaveBeenCalledTimes(1);
    expect(state.flushCover).toHaveBeenCalledTimes(1);
    expect(state.store.set).toHaveBeenCalledWith('mediaRoots', ['D:/r1', 'D:/r2']);
    expect(state.quit).toHaveBeenCalledTimes(1);
  });

  it('ignores later quit events while shutting down', async () => {
    const handler = install();
    handler({ preventDefault: state.preventDefault });
    await settle();

    const event = { preventDefault: vi.fn() };
    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(state.quit).toHaveBeenCalledTimes(1);
  });

  it('kills active download children and aborts the rest', async () => {
    const child = { id: 'child' };
    const abort = { abort: vi.fn() };
    state.jobs.set('a', { id: 'a', status: 'downloading', child });
    state.jobs.set('b', { id: 'b', status: 'downloading' });
    state.jobs.set('c', { id: 'c', status: 'completed', child: { id: 'other' } });
    state.aborts.set('b', abort);

    const handler = install();
    handler({ preventDefault: state.preventDefault });
    await settle();

    expect(state.kill).toHaveBeenCalledWith(child);
    expect(abort.abort).toHaveBeenCalledTimes(1);
    expect(state.kill).toHaveBeenCalledTimes(1);
  });

  it('swallows child kill failures', async () => {
    state.kill.mockImplementation(() => {
      throw new Error('gone');
    });
    state.jobs.set('a', { id: 'a', status: 'downloading', child: {} });

    const handler = install();
    handler({ preventDefault: state.preventDefault });
    await settle();

    expect(state.quit).toHaveBeenCalledTimes(1);
  });

  it('works without a media server', async () => {
    state.getMediaServer.mockReturnValue(null);
    state.extraRoots.mockReturnValue([]);
    const handler = install();
    handler({ preventDefault: state.preventDefault });
    await settle();

    expect(state.quit).toHaveBeenCalledTimes(1);
    expect(state.store.set).toHaveBeenCalledWith('mediaRoots', []);
  });
});

describe('failures and timeouts', () => {
  it('logs failures and still quits', async () => {
    state.unregisterAll.mockImplementation(() => {
      throw new Error('shortcut');
    });
    const handler = install();

    handler({ preventDefault: state.preventDefault });
    await settle();

    expect(state.loggerError).toHaveBeenCalledWith(
      'main',
      'graceful shutdown failed',
      expect.any(Error)
    );
    expect(state.quit).toHaveBeenCalledTimes(1);
  });

  it('quits after the flush timeout', async () => {
    state.flushLogs.mockReturnValue(new Promise(() => {}));
    const handler = install();

    handler({ preventDefault: state.preventDefault });
    await settle();
    expect(state.quit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);

    expect(state.loggerWarn).toHaveBeenCalledWith(
      'main',
      'graceful shutdown flush exceeded 5000ms — quitting anyway'
    );
    expect(state.quit).toHaveBeenCalledTimes(1);
  });
});
