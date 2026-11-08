import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { depEvents } from '@renderer/utils/depEvents';
import { useSettingsStore } from '@renderer/stores/settings';
import { useDependencies } from '../useDependencies';
import type { DepToolStatus } from '@shared/types/ipc';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

function status(over: Partial<DepToolStatus> = {}): DepToolStatus {
  return {
    installed: true,
    version: '1.0',
    path: 'C:/tools/tool.exe',
    managed: false,
    source: 'system',
    broken: false,
    error: null,
    ...over
  };
}

const handlers = new Map<string, (payload: unknown) => void>();
const cleanups: ReturnType<typeof vi.fn>[] = [];

type InstallResult = { success: boolean; error?: string; cancelled?: boolean };
type UpdateInfo = { updateAvailable: boolean; current: string | null; latest: string | null };

const api = {
  checkFfmpeg: vi.fn(async () => status()),
  checkFfprobe: vi.fn(async () => status()),
  checkYtdlp: vi.fn(async () => status()),
  checkMkvextract: vi.fn(async () => status()),
  checkUpdateYtdlp: vi.fn(async (): Promise<UpdateInfo> => ({
    updateAvailable: false,
    current: null,
    latest: null
  })),
  installFfmpeg: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  installYtdlp: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  installMkvextract: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  updateYtdlp: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  removeFfmpeg: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  removeFfprobe: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  removeYtdlp: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  removeMkvextract: vi.fn(async (): Promise<InstallResult> => ({ success: true })),
  cancelDepInstall: vi.fn(async () => true),
  invoke: vi.fn(async () => true),
  on: vi.fn((channel: string, handler: (payload: unknown) => void) => {
    handlers.set(channel, handler);
    const cleanup = vi.fn();
    cleanups.push(cleanup);
    return cleanup;
  })
};

function installBridge() {
  (window as unknown as { api: unknown }).api = api;
}

function mountDependencies(pinia: Pinia = createPinia()) {
  let result: ReturnType<typeof useDependencies> | null = null;
  const app = createApp({
    setup() {
      result = useDependencies();
      return () => h('div');
    }
  });
  app.use(pinia);
  app.mount(document.createElement('div'));
  return {
    api: result as unknown as ReturnType<typeof useDependencies>,
    settings: useSettingsStore(pinia),
    unmount: () => app.unmount()
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  handlers.clear();
  cleanups.length = 0;
  depEvents.clear();
  for (const fn of [
    api.checkFfmpeg,
    api.checkFfprobe,
    api.checkYtdlp,
    api.checkMkvextract,
    api.checkUpdateYtdlp,
    api.installFfmpeg,
    api.installYtdlp,
    api.installMkvextract,
    api.updateYtdlp,
    api.removeFfmpeg,
    api.removeFfprobe,
    api.removeYtdlp,
    api.removeMkvextract,
    api.cancelDepInstall,
    api.invoke
  ]) {
    fn.mockReset();
  }
  api.checkFfmpeg.mockResolvedValue(status());
  api.checkFfprobe.mockResolvedValue(status());
  api.checkYtdlp.mockResolvedValue(status());
  api.checkMkvextract.mockResolvedValue(status());
  api.checkUpdateYtdlp.mockResolvedValue({
    updateAvailable: false,
    current: null,
    latest: null
  });
  api.installFfmpeg.mockResolvedValue({ success: true });
  api.installYtdlp.mockResolvedValue({ success: true });
  api.installMkvextract.mockResolvedValue({ success: true });
  api.updateYtdlp.mockResolvedValue({ success: true });
  api.removeFfmpeg.mockResolvedValue({ success: true });
  api.removeFfprobe.mockResolvedValue({ success: true });
  api.removeYtdlp.mockResolvedValue({ success: true });
  api.removeMkvextract.mockResolvedValue({ success: true });
  api.cancelDepInstall.mockResolvedValue(true);
  api.invoke.mockResolvedValue(true);
  installBridge();
});

describe('initial state', () => {
  it('seeds rows from the persisted settings', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSettingsStore(pinia).updateDependency('yt-dlp', {
      installed: true,
      version: '2024.1',
      checkedAt: 1,
      path: 'C:/yt-dlp.exe',
      managed: true
    });

    const { api: deps, unmount } = mountDependencies(pinia);
    const yt = deps.deps.value.find((row) => row.tool === 'yt-dlp')!;

    expect(yt).toMatchObject({
      name: 'yt-dlp',
      description: 'settings.ytdlpDesc',
      installed: true,
      version: '2024.1',
      path: 'C:/yt-dlp.exe',
      managed: true,
      source: null,
      broken: false,
      probeError: null,
      updateAvailable: false,
      installing: false,
      percent: 0,
      error: null
    });
    await flush();
    unmount();
  });

  it('registers the progress listener and unsubscribes on unmount', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();

    expect(api.on).toHaveBeenCalledWith('dep:progress', expect.any(Function));
    const handler = handlers.get('dep:progress')!;
    handler({ tool: 'ffmpeg', percent: 42 });
    expect(deps.deps.value[0].percent).toBe(42);

    handler({ tool: 'unknown', percent: 90 });
    expect(deps.deps.value[0].percent).toBe(42);

    unmount();
    expect(cleanups.some((cleanup) => cleanup.mock.calls.length > 0)).toBe(true);
  });
});

describe('refreshAll', () => {
  it('applies probe results to every row and persists them', async () => {
    api.checkFfprobe.mockResolvedValue(
      status({ installed: true, version: '6.0', path: 'C:/ffprobe.exe', managed: true })
    );
    const { api: deps, settings, unmount } = mountDependencies();
    await flush();

    expect(deps.deps.value[0]).toMatchObject({ installed: true, version: '1.0' });
    expect(deps.deps.value[1]).toMatchObject({ version: '6.0', managed: true });
    expect(settings.getDependency('FFprobe')).toMatchObject({
      installed: true,
      version: '6.0',
      path: 'C:/ffprobe.exe',
      managed: true
    });
    expect(deps.refreshing.value).toBe(false);
    unmount();
  });

  it('falls back to empty statuses when a probe fails', async () => {
    api.checkFfmpeg.mockRejectedValueOnce(new Error('probe'));
    const { api: deps, unmount } = mountDependencies();
    await flush();

    expect(deps.deps.value[0]).toMatchObject({
      installed: false,
      version: null,
      path: null,
      managed: false
    });
    expect(deps.deps.value[1].installed).toBe(true);
    unmount();
  });

  it('clears transient state before probing', async () => {
    const { api: deps, unmount } = mountDependencies();
    deps.deps.value[0].installing = true;
    deps.deps.value[0].percent = 70;
    deps.deps.value[0].error = 'old';

    await deps.refreshAll();

    expect(deps.deps.value[0]).toMatchObject({ installing: false, percent: 0, error: null });
    unmount();
  });

  it('logs and resets refreshing when applying a status throws', async () => {
    const { api: deps, settings, unmount } = mountDependencies();
    await flush();
    const spy = vi.spyOn(settings, 'updateDependency').mockImplementation(() => {
      throw new Error('store');
    });

    await expect(deps.refreshAll()).resolves.toBeUndefined();
    expect(deps.refreshing.value).toBe(false);
    spy.mockRestore();
    unmount();
  });

  it('logs update-check failures without failing the refresh', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();
    api.checkUpdateYtdlp.mockRejectedValueOnce(new Error('network'));

    await expect(deps.refreshAll()).resolves.toBeUndefined();
    expect(deps.refreshing.value).toBe(false);
    expect(deps.deps.value[0].installed).toBe(true);
    unmount();
  });
});

describe('yt-dlp updates', () => {
  it('records an available update in the row and settings', async () => {
    const { api: deps, settings, unmount } = mountDependencies();
    await flush();
    api.checkUpdateYtdlp.mockResolvedValueOnce({
      updateAvailable: true,
      current: '2024.1',
      latest: '2024.9'
    });

    await deps.refreshAll();

    const yt = deps.deps.value.find((row) => row.tool === 'yt-dlp')!;
    expect(yt.updateAvailable).toBe(true);
    expect(settings.getDependency('yt-dlp')).toMatchObject({
      latestVersion: '2024.9',
      updateAvailable: true
    });
    unmount();
  });

  it('keeps the row clean when no update is available', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();

    expect(deps.deps.value.find((row) => row.tool === 'yt-dlp')!.updateAvailable).toBe(false);
    unmount();
  });
});

describe('runInstall', () => {
  it('installs, refreshes the status and announces the change', async () => {
    api.checkFfmpeg.mockResolvedValue(status({ installed: true, version: '9.9' }));
    api.checkFfprobe.mockResolvedValue(status({ installed: true, version: 'probe-1' }));
    const { api: deps, settings, unmount } = mountDependencies();
    await flush();
    // Drop the composable's own refresh listener so the assertions see exactly the
    // state that the install itself produced.
    depEvents.clear();
    const changed = vi.fn();
    depEvents.on('changed', changed);
    const dep = deps.deps.value[0];

    await deps.runInstall(dep, false);

    expect(api.installFfmpeg).toHaveBeenCalledTimes(1);
    expect(dep).toMatchObject({ installed: true, version: '9.9', installing: false, percent: 0 });
    expect(deps.deps.value[1].version).toBe('probe-1');
    expect(settings.getDependency('FFmpeg')).toMatchObject({ installed: true, version: '9.9' });
    expect(changed).toHaveBeenCalled();
    unmount();
  });

  it('uses the updater for yt-dlp when requested', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const yt = deps.deps.value.find((row) => row.tool === 'yt-dlp')!;

    await deps.runInstall(yt, true);

    expect(api.updateYtdlp).toHaveBeenCalledTimes(1);
    expect(api.installYtdlp).not.toHaveBeenCalled();
    unmount();
  });

  it('does not probe ffprobe after installing mkvextract', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const mkv = deps.deps.value.find((row) => row.tool === 'mkvextract')!;
    const before = api.checkFfprobe.mock.calls.length;

    await deps.runInstall(mkv, false);

    expect(api.installMkvextract).toHaveBeenCalledTimes(1);
    expect(api.checkFfprobe.mock.calls.length).toBe(before);
    unmount();
  });

  it('resets the row when the post-install probe throws', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();
    depEvents.clear();
    api.checkFfmpeg.mockRejectedValueOnce(new Error('probe'));
    const dep = deps.deps.value[0];
    dep.version = 'before';

    await deps.runInstall(dep, false);

    // `safeCheck` returns the empty status, which still counts as a status, so the
    // stale version must be replaced instead of kept.
    expect(dep).toMatchObject({ installed: false, version: null });
    unmount();
  });

  it('reports a failed install', async () => {
    api.installFfmpeg.mockResolvedValueOnce({ success: false, error: 'no network' });
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const dep = deps.deps.value[0];

    await deps.runInstall(dep, false);

    expect(dep).toMatchObject({ installing: false, error: 'no network' });
    unmount();
  });

  it('uses the translated message when the install throws', async () => {
    api.installFfmpeg.mockRejectedValueOnce(new Error('spawn'));
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const dep = deps.deps.value[0];

    await deps.runInstall(dep, false);

    expect(dep).toMatchObject({ installing: false, error: 'settings.depInstallFailed' });
    unmount();
  });

  it('treats a cancelled elevation prompt as a no-op', async () => {
    api.installFfmpeg.mockResolvedValueOnce({ success: false, cancelled: true });
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const dep = deps.deps.value[0];

    await deps.runInstall(dep, false);

    expect(dep).toMatchObject({ installing: false, error: null });
    unmount();
  });
});

describe('uninstallDependency', () => {
  it('clears the status and announces the change', async () => {
    const { api: deps, settings, unmount } = mountDependencies();
    await flush();
    depEvents.clear();
    const changed = vi.fn();
    depEvents.on('changed', changed);
    const dep = deps.deps.value[0];

    await deps.uninstallDependency(dep);

    expect(api.removeFfmpeg).toHaveBeenCalledTimes(1);
    expect(dep).toMatchObject({ installed: false, version: null, installing: false });
    expect(settings.getDependency('FFmpeg')).toMatchObject({ installed: false });
    expect(changed).toHaveBeenCalled();
    unmount();
  });

  it('refreshes ffprobe after removing ffmpeg', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();
    depEvents.clear();
    api.checkFfprobe.mockResolvedValueOnce(status({ installed: false, version: null }));
    const dep = deps.deps.value[0];

    await deps.uninstallDependency(dep);

    expect(deps.deps.value[1]).toMatchObject({ installed: false, version: null });
    unmount();
  });

  it('reports a failed removal', async () => {
    api.removeMkvextract.mockResolvedValueOnce({ success: false, error: 'locked' });
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const dep = deps.deps.value.find((row) => row.tool === 'mkvextract')!;

    await deps.uninstallDependency(dep);

    expect(dep).toMatchObject({ installing: false, error: 'locked' });
    unmount();
  });

  it('uses the translated message when removal throws', async () => {
    api.removeYtdlp.mockRejectedValueOnce(new Error('locked'));
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const dep = deps.deps.value.find((row) => row.tool === 'yt-dlp')!;

    await deps.uninstallDependency(dep);

    expect(dep).toMatchObject({ installing: false, error: 'settings.depInstallFailed' });
    unmount();
  });

  it('treats a cancelled removal as a no-op', async () => {
    api.removeFfmpeg.mockResolvedValueOnce({ success: false, cancelled: true });
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const dep = deps.deps.value[0];

    await deps.uninstallDependency(dep);

    expect(dep).toMatchObject({ installing: false, error: null });
    unmount();
  });
});

describe('cancelInstall', () => {
  it('forwards the tool and resets transient state', async () => {
    const { api: deps, unmount } = mountDependencies();
    await flush();
    const dep = deps.deps.value[2];
    dep.installing = true;
    dep.percent = 55;

    await deps.cancelInstall(dep);

    expect(api.cancelDepInstall).toHaveBeenCalledWith('yt-dlp');
    expect(dep).toMatchObject({ installing: false, percent: 0 });
    unmount();
  });
});
