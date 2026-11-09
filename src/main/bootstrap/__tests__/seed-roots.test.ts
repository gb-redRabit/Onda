import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  getPath: vi.fn(() => 'D:/Downloads'),
  tmpdir: vi.fn(() => 'C:/Temp'),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  markPhase: vi.fn(),
  applyCover: vi.fn(),
  initCover: vi.fn(),
  setLocale: vi.fn(),
  addRoot: vi.fn(),
  extraRoots: vi.fn(() => ['D:/x']),
  setRoots: vi.fn(),
  setRootsHandler: vi.fn(),
  setRadioPredicate: vi.fn(),
  isAllowedRadio: vi.fn(() => true),
  applyLog: vi.fn(),
  setCloseToTray: vi.fn(),
  setAutoLaunch: vi.fn(),
  getStore: vi.fn(),
  store: null as any
}));

vi.mock('electron', () => ({ app: { getPath: state.getPath } }));
vi.mock('os', () => ({ default: { tmpdir: state.tmpdir } }));
vi.mock('../../../shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: state.loggerInfo, error: vi.fn() }
}));
vi.mock('../../boot-timeline', () => ({ markBootPhase: state.markPhase }));
vi.mock('../../ipc/cover/cover-cache', () => ({
  applyCoverCacheSettings: state.applyCover,
  getStore: state.getStore,
  initCoverCache: state.initCover
}));
vi.mock('../../i18n-main', () => ({ setMainLocale: state.setLocale }));
vi.mock('../../media/media-server', () => ({
  addAllowedRoot: state.addRoot,
  getExtraRoots: state.extraRoots,
  setAllowedRoots: state.setRoots,
  setRootsChangedHandler: state.setRootsHandler
}));
vi.mock('../../media/media-server-guards', () => ({
  setAllowedRadioHostPredicate: state.setRadioPredicate
}));
vi.mock('../../ipc/radio-store', () => ({ isAllowedRadioHost: state.isAllowedRadio }));
vi.mock('../../log-file', () => ({ applyLogSettings: state.applyLog }));
vi.mock('../../windows/close-behavior', () => ({ setCloseToTray: state.setCloseToTray }));
vi.mock('../../windows/auto-launch', () => ({ setAutoLaunch: state.setAutoLaunch }));

import { seedMediaServerAndSettings } from '../seed-roots';

function makeStore(data: Record<string, unknown>) {
  return {
    get: vi.fn((key: string, fallback?: unknown) => (key in data ? data[key] : fallback)),
    set: vi.fn(async () => undefined)
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  state.getPath.mockClear();
  state.tmpdir.mockClear();
  state.loggerWarn.mockReset();
  state.loggerInfo.mockReset();
  state.markPhase.mockClear();
  state.applyCover.mockClear();
  state.initCover.mockReset();
  state.setLocale.mockClear();
  state.addRoot.mockReset();
  state.addRoot.mockResolvedValue(undefined);
  state.extraRoots.mockReset();
  state.extraRoots.mockReturnValue(['D:/a', 'D:/b']);
  state.setRoots.mockReset();
  state.setRoots.mockResolvedValue(undefined);
  state.setRootsHandler.mockReset();
  state.setRadioPredicate.mockClear();
  state.isAllowedRadio.mockClear();
  state.applyLog.mockClear();
  state.setCloseToTray.mockClear();
  state.setAutoLaunch.mockClear();
  state.store = makeStore({
    library: { coverCacheMaxEntries: 3000 },
    appearance: { locale: 'pl' },
    libraryFolders: ['D:/music', 'D:/video'],
    mediaRoots: ['D:/stored'],
    general: {
      autoLaunch: true,
      startMinimized: false,
      closeToTray: false,
      logLevel: 'debug',
      logMaxSizeMB: 20
    }
  });
  state.getStore.mockReset();
  state.getStore.mockImplementation(async () => state.store);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('media roots', () => {
  it('applies stored settings and seeds roots', async () => {
    const result = await seedMediaServerAndSettings();

    expect(state.setRadioPredicate).toHaveBeenCalledWith(state.isAllowedRadio);
    expect(state.setRadioPredicate.mock.invocationCallOrder[0]).toBeLessThan(
      state.getStore.mock.invocationCallOrder[0]
    );
    expect(state.applyCover).toHaveBeenCalledWith(3000);
    expect(state.initCover).toHaveBeenCalledTimes(1);
    expect(state.setLocale).toHaveBeenCalledWith('pl');
    expect(state.setRoots).toHaveBeenCalledWith(['D:/music', 'D:/video']);
    expect(result).toEqual({ folders: 2, roots: 1 });

    const roots = state.addRoot.mock.calls.map(([root]) => root);
    expect(roots).toEqual([
      'D:/stored',
      'D:/Downloads',
      join('C:/Temp', 'onda', 'audio-transcodes'),
      join('C:/Temp', 'onda', 'video-transcodes')
    ]);
    expect(state.loggerInfo).toHaveBeenCalledWith('boot', 'settings: folders=2 roots=1');
    expect(state.markPhase.mock.calls.map(([phase]) => phase)).toEqual([
      'settings store ready',
      'cover settings applied',
      'media roots ready',
      'settings applied'
    ]);
  });

  it('deduplicates seed roots', async () => {
    state.store = makeStore({
      libraryFolders: ['D:/music'],
      mediaRoots: ['D:/Downloads']
    });

    await seedMediaServerAndSettings();

    const roots = state.addRoot.mock.calls.map(([root]) => root);
    expect(roots.filter((root) => root === 'D:/Downloads')).toHaveLength(1);
  });

  it('handles missing or non-array folder lists', async () => {
    state.store = makeStore({ libraryFolders: 'nope', mediaRoots: {} });

    const result = await seedMediaServerAndSettings();

    expect(state.setRoots).not.toHaveBeenCalled();
    expect(result).toEqual({ folders: 0, roots: 0 });
    expect(state.addRoot).toHaveBeenCalledTimes(3);
  });

  it('persists extra roots with a debounce and a cap', async () => {
    await seedMediaServerAndSettings();
    const handler = state.setRootsHandler.mock.calls[0][0];
    state.extraRoots.mockReturnValue(Array.from({ length: 60 }, (_, i) => `D:/r${i}`));

    handler();
    handler();
    await vi.advanceTimersByTimeAsync(499);
    expect(state.store.set).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(state.store.set).toHaveBeenCalledTimes(1);
    expect(state.store.set).toHaveBeenCalledWith('mediaRoots', expect.any(Array));
    expect(state.store.set.mock.calls[0][1]).toHaveLength(50);

    handler();
    await vi.advanceTimersByTimeAsync(500);
    expect(state.store.set).toHaveBeenCalledTimes(2);
  });
});

describe('general settings', () => {
  it('applies logs, tray and autostart', async () => {
    await seedMediaServerAndSettings();

    expect(state.applyLog).toHaveBeenCalledWith('debug', 20);
    expect(state.setCloseToTray).toHaveBeenCalledWith(false);
    expect(state.setAutoLaunch).toHaveBeenCalledWith({ enabled: true, hidden: false });
  });

  it('skips unset booleans and normalises tray/autostart', async () => {
    state.store = makeStore({
      general: { autoLaunch: 0, startMinimized: 1 }
    });

    await seedMediaServerAndSettings();

    expect(state.setCloseToTray).not.toHaveBeenCalled();
    expect(state.setAutoLaunch).toHaveBeenCalledWith({ enabled: false, hidden: true });
  });

  it('reads without a general section', async () => {
    state.store = makeStore({});
    await seedMediaServerAndSettings();

    expect(state.applyLog).toHaveBeenCalledWith(undefined, undefined);
    expect(state.setCloseToTray).not.toHaveBeenCalled();
    expect(state.setAutoLaunch).not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it('logs store failures and returns zero counts', async () => {
    state.getStore.mockRejectedValue(new Error('no store'));

    const result = await seedMediaServerAndSettings();

    expect(result).toEqual({ folders: 0, roots: 0 });
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'main',
      'seeding media server roots from library folders failed',
      expect.any(Error)
    );
    expect(state.setRadioPredicate).toHaveBeenCalled();
  });

  it('validates cover cache and locale values', async () => {
    state.store = makeStore({
      library: { coverCacheMaxEntries: 'lots' },
      appearance: { locale: 42 }
    });

    await seedMediaServerAndSettings();

    expect(state.applyCover).toHaveBeenCalledWith(undefined);
    expect(state.setLocale).toHaveBeenCalledWith(undefined);
  });
});
