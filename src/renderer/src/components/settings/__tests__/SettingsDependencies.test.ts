import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  deps: null as any,
  refreshing: null as any,
  refreshAll: vi.fn(),
  runInstall: vi.fn(),
  uninstallDependency: vi.fn(),
  cancelInstall: vi.fn()
}));

vi.mock('@renderer/composables/useDependencies', () => ({
  useDependencies: () => ({
    deps: h.deps,
    refreshing: h.refreshing,
    refreshAll: h.refreshAll,
    runInstall: h.runInstall,
    uninstallDependency: h.uninstallDependency,
    cancelInstall: h.cancelInstall
  })
}));

import SettingsDependencies from '../SettingsDependencies.vue';

const GroupStub = { props: ['title', 'description'], template: '<div><slot /></div>' };

let wrapper: VueWrapper | null = null;

function dep(overrides: Record<string, unknown> = {}) {
  return {
    name: 'yt-dlp',
    description: 'Video downloader',
    installed: true,
    broken: false,
    source: 'managed',
    version: '2024.1',
    updateAvailable: false,
    tool: 'yt-dlp',
    installing: false,
    percent: 0,
    path: '',
    error: undefined,
    probeError: undefined,
    ...overrides
  };
}

function mountSettings(deps: unknown[], refreshing = false) {
  h.deps = ref(deps);
  h.refreshing = ref(refreshing);
  wrapper = mount(SettingsDependencies, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { SettingsGroup: GroupStub }
    }
  });
  return wrapper;
}

function group(index: number) {
  return wrapper!.findAllComponents(GroupStub)[index];
}

function textOf(index: number) {
  return group(index).text();
}

function buttonIn(index: number, label: string) {
  return group(index)
    .findAll('button')
    .find((button) => button.text() === label);
}

beforeEach(() => {
  for (const fn of Object.values(h)) {
    if (typeof fn === 'function') (fn as ReturnType<typeof vi.fn>).mockClear();
  }
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('refresh', () => {
  it('disables the refresh button while refreshing', async () => {
    mountSettings([], true);
    const button = wrapper!.get('button');

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.html()).toContain('animate-spin');
    await button.trigger('click');
    expect(h.refreshAll).not.toHaveBeenCalled();
  });

  it('runs a refresh and marks the icon while active', async () => {
    mountSettings([], false);
    const button = wrapper!.get('button');

    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.html()).not.toContain('animate-spin');

    await button.trigger('click');
    expect(h.refreshAll).toHaveBeenCalledTimes(1);
  });
});

describe('dependency states', () => {
  it('shows bundled, managed and system badges', () => {
    mountSettings([
      dep({ name: 'ffmpeg', source: 'bundled' }),
      dep({ name: 'yt-dlp', source: 'managed' }),
      dep({ name: 'aria2', source: 'system' })
    ]);

    expect(textOf(0)).toContain('settings.depBundled');
    expect(textOf(1)).toContain('settings.depManaged');
    expect(textOf(2)).toContain('settings.depSystem');
  });

  it('shows version, up-to-date and update states', () => {
    mountSettings([
      dep({ updateAvailable: false }),
      dep({ name: 'other', tool: 'ffmpeg', updateAvailable: true, version: '1.0' })
    ]);

    expect(textOf(0)).toContain('v2024.1');
    expect(textOf(0)).toContain('settings.depUpToDate');
    expect(textOf(1)).toContain('settings.depUpdateAvailable');
    expect(textOf(1)).not.toContain('settings.depUpToDate');
  });

  it('shows missing and broken states with the right actions', () => {
    mountSettings([
      dep({ name: 'missing', installed: false, version: '', tool: 'ffmpeg' }),
      dep({ name: 'broken', broken: true, tool: 'ffmpeg' })
    ]);

    expect(textOf(0)).toContain('settings.depMissing');
    expect(buttonIn(0, 'settings.depInstall')).toBeTruthy();

    expect(textOf(1)).toContain('settings.depBroken');
    expect(buttonIn(1, 'settings.depRepair')).toBeTruthy();
    expect(buttonIn(1, 'settings.depUninstall')).toBeTruthy();
  });

  it('installs, updates and uninstalls with the dependency payload', async () => {
    const missing = dep({ name: 'missing', installed: false });
    const updatable = dep({ name: 'updatable', updateAvailable: true, version: '1.0' });
    const installed = dep({ name: 'installed' });
    mountSettings([missing, updatable, installed]);

    await buttonIn(0, 'settings.depInstall')!.trigger('click');
    await buttonIn(1, 'settings.depUpdate')!.trigger('click');
    await buttonIn(2, 'settings.depUninstall')!.trigger('click');

    expect(h.runInstall).toHaveBeenCalledWith(missing, false);
    expect(h.runInstall).toHaveBeenCalledWith(updatable, true);
    expect(h.uninstallDependency).toHaveBeenCalledWith(installed);
  });

  it('shows progress and cancels a running install', async () => {
    const installing = dep({ installing: true, percent: 42 });
    mountSettings([installing]);

    expect(textOf(0)).toContain('42%');
    expect(textOf(0)).not.toContain('settings.depInstall');

    await buttonIn(0, 'settings.depCancel')!.trigger('click');

    expect(h.cancelInstall).toHaveBeenCalledWith(installing);
  });

  it('renders the install path and errors', () => {
    mountSettings([
      dep({ path: 'C:/tools/yt-dlp.exe', error: 'download failed' }),
      dep({ name: 'probe', probeError: 'probe failed' })
    ]);

    expect(textOf(0)).toContain('C:/tools/yt-dlp.exe');
    expect(textOf(0)).toContain('download failed');
    expect(textOf(1)).toContain('probe failed');
  });
});
