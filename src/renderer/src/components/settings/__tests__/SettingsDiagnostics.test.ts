import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import SettingsDiagnostics from '../SettingsDiagnostics.vue';

const state = vi.hoisted(() => ({
  api: null as any,
  notify: vi.fn(),
  showConfirm: vi.fn(async () => true),
  prompt: null as any,
  loggerWarn: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@shared/logger', () => ({
  logger: { warn: state.loggerWarn, info: vi.fn(), error: vi.fn() }
}));
vi.mock('@renderer/utils/bootMetrics', () => ({
  getRendererBootMetrics: () => ({ totalMs: 120 })
}));
vi.mock('@renderer/stores/ui', () => ({
  useUIStore: () => ({ notify: state.notify })
}));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => state.prompt
}));

const SettingsGroupStub = { template: '<div><slot /></div>' };
const ButtonStub = { template: '<button><slot /></button>' };
const PromptStub = { template: '<div />' };

let wrapper: VueWrapper | null = null;

const appInfo = {
  version: '1.2.3',
  electron: '40.0',
  chrome: '130',
  node: '22',
  v8: '13',
  os: 'Windows',
  platform: 'win32',
  arch: 'x64',
  uptime: 42,
  userDataPath: '/data',
  logPath: '/data/logs'
};

const resolver = [
  {
    tool: 'ffmpeg',
    path: '/bin/ffmpeg',
    managed: true,
    version: '7',
    source: 'managed',
    broken: false,
    error: null
  },
  {
    tool: 'ffprobe',
    path: null,
    managed: false,
    version: null,
    source: null,
    broken: false,
    error: null
  }
];

const warnings = [{ at: 1_700_000_000_000, text: 'first warning', count: 2 }];
const perf = {
  mainRssMb: 120,
  processes: [{ type: 'renderer', rssMb: 80 }],
  phases: [
    { label: 'main', ms: 100 },
    { label: 'renderer', ms: 50 }
  ]
};

function mountDiagnostics() {
  wrapper = mount(SettingsDiagnostics, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        SettingsGroup: SettingsGroupStub,
        Button: ButtonStub,
        ExplorerPromptDialog: PromptStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function buttons() {
  return wrapper!.findAll('button');
}

beforeEach(() => {
  state.api = {
    getAppInfo: vi.fn(async () => appInfo),
    readLogs: vi.fn(async () => 'log line'),
    getDependencyPaths: vi.fn(async () => resolver),
    getRecentWarnings: vi.fn(async () => warnings),
    getPerfSnapshot: vi.fn(async () => perf),
    downloadLog: vi.fn(async () => ({ success: true })),
    clearLogs: vi.fn(async () => true),
    clearCache: vi.fn(async () => ({ success: true, filesRemoved: 3, bytesFreed: 2048 })),
    factoryReset: vi.fn(async () => ({ success: true }))
  };
  state.notify.mockClear();
  state.showConfirm.mockReset();
  state.showConfirm.mockResolvedValue(true);
  state.loggerWarn.mockClear();
  state.t.mockClear();
  state.prompt = {
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    showConfirm: state.showConfirm,
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
  (window as { api?: unknown }).api = state.api;
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

describe('loading', () => {
  it('loads info, logs, resolver, warnings and perf on mount', async () => {
    mountDiagnostics();
    await flush();

    expect(state.api.getAppInfo).toHaveBeenCalled();
    expect(state.api.readLogs).toHaveBeenCalled();
    expect(state.api.getDependencyPaths).toHaveBeenCalled();
    expect(state.api.getRecentWarnings).toHaveBeenCalled();
    expect(state.api.getPerfSnapshot).toHaveBeenCalled();

    expect(wrapper!.text()).toContain('40.0');
    expect(wrapper!.text()).toContain('log line');
    expect(wrapper!.text()).toContain('first warning');
    expect(wrapper!.text()).toContain('120 MB');
    expect(wrapper!.text()).toContain('settings.depManaged');
    expect(wrapper!.text()).toContain('settings.depMissing');
  });

  it('logs and keeps defaults when loading fails', async () => {
    state.api.getAppInfo.mockRejectedValue(new Error('ipc'));
    mountDiagnostics();
    await flush();
    expect(state.loggerWarn).toHaveBeenCalledWith('diagnostics', 'load failed', expect.any(Error));
  });

  it('refreshes and downloads logs', async () => {
    mountDiagnostics();
    await flush();
    state.api.getAppInfo.mockClear();

    await buttons()[2].trigger('click');
    await flush();
    expect(state.api.getAppInfo).toHaveBeenCalled();

    await buttons()[3].trigger('click');
    await flush();
    expect(state.api.downloadLog).toHaveBeenCalled();
  });
});

describe('logs', () => {
  it('clears logs only after confirmation', async () => {
    mountDiagnostics();
    await flush();

    state.showConfirm.mockResolvedValueOnce(false);
    await buttons()[4].trigger('click');
    expect(state.api.clearLogs).not.toHaveBeenCalled();

    state.showConfirm.mockResolvedValueOnce(true);
    await buttons()[4].trigger('click');
    await flush();
    expect(state.api.clearLogs).toHaveBeenCalled();
    expect(wrapper!.text()).not.toContain('log line');
  });

  it('keeps logs when clearing reports failure', async () => {
    state.api.clearLogs.mockResolvedValue(false);
    mountDiagnostics();
    await flush();
    await buttons()[4].trigger('click');
    await flush();
    expect(wrapper!.text()).toContain('log line');
  });
});

describe('cache', () => {
  it('clears the cache after confirmation and notifies', async () => {
    mountDiagnostics();
    await flush();
    state.showConfirm.mockResolvedValueOnce(false);
    await buttons()[0].trigger('click');
    expect(state.api.clearCache).not.toHaveBeenCalled();

    state.showConfirm.mockResolvedValueOnce(true);
    await buttons()[0].trigger('click');
    await flush();

    expect(state.api.clearCache).toHaveBeenCalled();
    expect(state.notify).toHaveBeenCalledWith(
      'success',
      'settings.cacheCleared',
      expect.any(String)
    );
  });

  it('reports cache failures', async () => {
    state.api.clearCache.mockResolvedValue({ success: false, error: 'locked' });
    mountDiagnostics();
    await flush();
    await buttons()[0].trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith('error', 'settings.cacheClearError', 'locked');

    state.notify.mockClear();
    state.api.clearCache.mockRejectedValue(new Error('disk'));
    await buttons()[0].trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith('error', 'settings.cacheClearError', 'Error: disk');
    expect(state.loggerWarn).toHaveBeenCalledWith(
      'diagnostics',
      'clear cache failed',
      expect.any(Error)
    );
  });
});

describe('factory reset', () => {
  it('resets after confirmation and shows restarting state', async () => {
    mountDiagnostics();
    await flush();
    state.showConfirm.mockResolvedValueOnce(false);
    await buttons()[1].trigger('click');
    expect(state.api.factoryReset).not.toHaveBeenCalled();

    state.showConfirm.mockResolvedValueOnce(true);
    await buttons()[1].trigger('click');
    await flush();

    expect(state.api.factoryReset).toHaveBeenCalled();
    expect(state.notify).toHaveBeenCalledWith('success', 'settings.resetFactoryRestarting');
    expect(wrapper!.text()).toContain('settings.resetFactoryRestarting');
  });

  it('reports reset failures', async () => {
    state.api.factoryReset.mockResolvedValue({ success: false, error: 'denied' });
    mountDiagnostics();
    await flush();
    await buttons()[1].trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith('error', 'settings.resetFactoryError', 'denied');

    state.notify.mockClear();
    state.api.factoryReset.mockRejectedValue(new Error('boom'));
    await buttons()[1].trigger('click');
    await flush();
    expect(state.notify).toHaveBeenCalledWith('error', 'settings.resetFactoryError', 'Error: boom');
  });
});
