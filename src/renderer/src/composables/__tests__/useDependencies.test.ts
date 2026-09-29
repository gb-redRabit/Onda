import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { depEvents } from '@renderer/utils/depEvents';
import { useDependencies } from '../useDependencies';
import type { DepToolStatus } from '@shared/types/ipc';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}));

const check = {
  checkFfmpeg: vi.fn(async () => status()),
  checkFfprobe: vi.fn(async () => status()),
  checkYtdlp: vi.fn(async () => status()),
  checkMkvextract: vi.fn(async () => status()),
  checkUpdateYtdlp: vi.fn(async () => ({ updateAvailable: false, current: null, latest: null }))
};

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

function mountUseDependencies() {
  let api: ReturnType<typeof useDependencies> | null = null;
  const app = createApp({
    setup() {
      api = useDependencies();
      return () => h('div');
    }
  });
  app.use(createPinia());
  app.mount(document.createElement('div'));
  return {
    api: api as unknown as ReturnType<typeof useDependencies>,
    unmount: () => app.unmount()
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  setActivePinia(createPinia());
  for (const fn of Object.values(check)) fn.mockClear();
  (window as unknown as { api: unknown }).api = {
    ...check,
    invoke: vi.fn(async () => true),
    on: vi.fn(() => () => {})
  };
});

describe('useDependencies status refresh', () => {
  it('re-probes when another view reports a dependency change', async () => {
    const { unmount } = mountUseDependencies();
    await flush();
    expect(check.checkFfmpeg).toHaveBeenCalledTimes(1);

    // Settings installed/uninstalled something: the wizard/settings copy must not
    // stay stale until the next restart.
    depEvents.emit('changed');
    await flush();

    expect(check.checkFfmpeg.mock.calls.length).toBeGreaterThan(1);
    unmount();
  });

  it('invalidates the main-process probe cache on every refresh', async () => {
    const { unmount } = mountUseDependencies();
    await flush();
    const api = (window as unknown as { api: { invoke: ReturnType<typeof vi.fn> } }).api;

    expect(api.invoke).toHaveBeenCalledWith('dep:recheck');
    unmount();
  });

  it('exposes a refreshing flag while the checks are running', async () => {
    const { api, unmount } = mountUseDependencies();
    await flush();
    expect(api.refreshing.value).toBe(false);

    const pending = api.refreshAll();
    expect(api.refreshing.value).toBe(true);

    await pending;
    expect(api.refreshing.value).toBe(false);
    unmount();
  });

  it('stops listening once the view is gone', async () => {
    const { unmount } = mountUseDependencies();
    await flush();
    const calls = check.checkFfmpeg.mock.calls.length;

    unmount();
    depEvents.emit('changed');
    await flush();

    expect(check.checkFfmpeg.mock.calls.length).toBe(calls);
  });
});
