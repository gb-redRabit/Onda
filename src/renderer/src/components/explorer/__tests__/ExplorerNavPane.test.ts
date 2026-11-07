import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import ExplorerNavPane from '../ExplorerNavPane.vue';

const state = vi.hoisted(() => ({
  explorer: null as any,
  library: null as any,
  settings: null as any,
  invoke: vi.fn(),
  send: vi.fn(),
  showConfirm: vi.fn(),
  drivesForTest: [] as any[],
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/utils/formatters', () => ({
  formatFileSize: (bytes: number) => `${bytes}B`
}));

let wrapper: VueWrapper | null = null;

function mountPane(props: Record<string, unknown> = {}) {
  wrapper = mount(ExplorerNavPane, {
    props,
    global: {
      mocks: { $t: state.t },
      provide: { showConfirm: state.showConfirm }
    }
  });
  return wrapper;
}

function buttons() {
  return wrapper!.findAll('button');
}

function quickButtons() {
  return buttons().slice(0, 3);
}

function driveButtons() {
  return buttons().filter((b) => b.attributes('title') !== undefined);
}

function folderButtons() {
  return buttons().filter((b) => b.text().includes('LIB'));
}

const drives = [
  { name: 'System', path: 'C:\\', total: 1000, free: 100 },
  { name: 'Data', path: 'D:\\', total: 1000, free: 200 },
  { name: 'Full', path: 'E:\\', total: 1000, free: 20 },
  { name: 'Empty', path: 'F:\\', total: 0, free: 0 }
];

beforeEach(() => {
  state.explorer = reactive({
    currentPath: 'C:/Users/me/Desktop',
    navigateTo: vi.fn(),
    loadFiles: vi.fn()
  });
  state.library = reactive({ folders: ['C:/Music', 'D:\\Library', 'E:/'] });
  state.settings = reactive({ explorer: { confirmBeforeMove: false } });
  state.invoke.mockReset();
  state.send.mockReset();
  state.showConfirm.mockReset();
  state.showConfirm.mockResolvedValue(true);
  state.t.mockClear();
  state.drivesForTest = drives as any;
  state.invoke.mockImplementation((channel: string, arg?: string) => {
    if (channel === 'app:getPath') {
      return Promise.resolve(arg === 'desktop' ? 'C:/Users/me/Desktop' : 'C:/Users/me/Downloads');
    }
    if (channel === 'fs:getDriveUsage') return Promise.resolve(drives);
    return Promise.resolve(true);
  });
  (window as { api?: unknown }).api = { invoke: state.invoke, send: state.send };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

// `drivesForTest` lets helpers know how many drive rows are rendered.

describe('mount', () => {
  it('does nothing without the preload bridge', async () => {
    delete (window as { api?: unknown }).api;
    mountPane();
    await flushPromises();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(buttons()).toHaveLength(6);
    expect(quickButtons()).toHaveLength(3);
  });

  it('loads desktop and download paths and drive usage', async () => {
    mountPane();
    await flushPromises();

    expect(state.invoke).toHaveBeenCalledWith('app:getPath', 'desktop');
    expect(state.invoke).toHaveBeenCalledWith('app:getPath', 'downloads');
    expect(state.invoke).toHaveBeenCalledWith('fs:getDriveUsage');
    expect(driveButtons()).toHaveLength(4);
    expect(wrapper!.text()).toContain('System');
  });

  it('keeps an empty drive list when usage lookup fails', async () => {
    state.invoke.mockImplementation((channel: string, arg?: string) => {
      if (channel === 'app:getPath') return Promise.resolve(arg === 'desktop' ? 'D' : 'L');
      return Promise.reject(new Error('no drives'));
    });
    mountPane();
    await flushPromises();
    expect(driveButtons()).toHaveLength(0);
  });
});

describe('quick links', () => {
  it('marks the active quick link and resolves desktop/downloads', async () => {
    mountPane();
    await flushPromises();

    const [pc, desktop, downloads] = quickButtons();
    expect(pc.classes()).not.toContain('bg-primary/14');
    expect(desktop.classes()).toContain('bg-primary/14');
    expect(downloads.classes()).not.toContain('bg-primary/14');

    await desktop.trigger('click');
    expect(state.explorer.navigateTo).toHaveBeenCalledWith('C:/Users/me/Desktop');
    await downloads.trigger('click');
    expect(state.explorer.navigateTo).toHaveBeenLastCalledWith('C:/Users/me/Downloads');
    await pc.trigger('click');
    expect(state.explorer.navigateTo).toHaveBeenLastCalledWith('');
  });

  it('disables unresolved links and never marks them active', async () => {
    state.invoke.mockImplementation((channel: string) => {
      if (channel === 'app:getPath') return Promise.resolve('');
      return Promise.resolve(drives);
    });
    state.explorer.currentPath = '';
    mountPane();
    await flushPromises();

    const [pc, desktop, downloads] = quickButtons();
    expect(pc.attributes('disabled')).toBeUndefined();
    expect(desktop.attributes('disabled')).toBeDefined();
    expect(downloads.attributes('disabled')).toBeDefined();
    expect(desktop.classes()).not.toContain('bg-primary/14');
    expect(pc.classes()).toContain('bg-primary/14');
  });
});

describe('drives', () => {
  it('renders usage percent, classes and titles', async () => {
    mountPane();
    await flushPromises();
    const [system, data, full, empty] = driveButtons();

    expect(system.get('.bg-error').attributes('style')).toContain('90%');
    expect(system.attributes('title')).toContain('explorer.driveUsage');
    expect(data.get('.bg-warning').attributes('style')).toContain('80%');
    expect(empty.find('.bg-primary\\/70').exists()).toBe(false);

    expect(full.get('.bg-error').attributes('style')).toContain('98%');
    expect(full.text()).toContain('20B');
    expect(empty.attributes('title')).toBe('Empty');
    expect(empty.text()).not.toContain('0B');
  });

  it('clamps usage percentages to the 0-100 range', async () => {
    const over = { name: 'Over', path: 'G:\\', total: 100, free: -50 };
    const under = { name: 'Under', path: 'H:\\', total: 100, free: 150 };
    state.invoke.mockImplementation((channel: string, arg?: string) => {
      if (channel === 'app:getPath') return Promise.resolve(arg === 'desktop' ? 'D' : 'L');
      return Promise.resolve([over, under]);
    });
    state.drivesForTest = [over, under];
    mountPane();
    await flushPromises();

    expect(driveButtons()[0].get('.bg-error').attributes('style')).toContain('100%');
    expect(driveButtons()[1].get('.bg-primary\\/70').attributes('style')).toContain('0%');
  });

  it('navigates to the drive and marks it active', async () => {
    state.explorer.currentPath = 'D:\\';
    mountPane();
    await flushPromises();

    const [, data] = driveButtons();
    expect(data.classes()).toContain('bg-primary/14');
    await data.trigger('click');
    expect(state.explorer.navigateTo).toHaveBeenCalledWith('D:\\');
  });

  it('refreshes drives only for roots and the empty path', async () => {
    state.explorer.currentPath = 'C:/Users/me';
    mountPane();
    await flushPromises();
    state.invoke.mockClear();

    state.explorer.currentPath = 'C:/Users/me/Documents';
    await flushPromises();
    expect(state.invoke).not.toHaveBeenCalledWith('fs:getDriveUsage');

    state.explorer.currentPath = '';
    await flushPromises();
    expect(state.invoke).toHaveBeenCalledWith('fs:getDriveUsage');

    state.invoke.mockClear();
    state.explorer.currentPath = 'D:\\';
    await flushPromises();
    expect(state.invoke).toHaveBeenCalledWith('fs:getDriveUsage');
  });
});

describe('library folders', () => {
  it('renders labels, badges and navigates to the folder', async () => {
    mountPane();
    await flushPromises();
    const folders = folderButtons();

    expect(folders).toHaveLength(3);
    expect(folders[0].text()).toContain('Music');
    expect(folders[1].text()).toContain('Library');
    expect(folders[2].text()).toContain('E:');
    expect(folders[0].text()).toContain('LIB');
    expect(folders[0].attributes('title')).toBeUndefined();
    expect(folders[0].find('[title="explorer.libraryFolder"]').exists()).toBe(true);

    await folders[1].trigger('click');
    expect(state.explorer.navigateTo).toHaveBeenCalledWith('D:\\Library');
  });

  it('marks the current library folder active', async () => {
    state.explorer.currentPath = 'C:/Music';
    mountPane();
    await flushPromises();
    expect(folderButtons()[0].classes()).toContain('bg-primary/14');
    expect(folderButtons()[1].classes()).not.toContain('bg-primary/14');
  });
});

describe('drag and drop', () => {
  function dataTransfer(raw: string) {
    return {
      getData: vi.fn(() => raw),
      dropEffect: ''
    };
  }

  it('marks drop targets and clears them after drag leave', async () => {
    mountPane();
    await flushPromises();
    const folder = folderButtons()[1];
    const dt = dataTransfer('');

    await folder.trigger('dragover', { dataTransfer: dt, ctrlKey: true });
    expect(dt.dropEffect).toBe('copy');
    expect(folder.classes()).toContain('ring-2');
    expect(folder.classes()).toContain('bg-primary/50');

    await folder.trigger('dragover', { dataTransfer: dt, metaKey: true });
    expect(dt.dropEffect).toBe('copy');
    await folder.trigger('dragover', { dataTransfer: dt });
    expect(dt.dropEffect).toBe('move');

    await folder.trigger('dragenter');
    await folder.trigger('dragenter');
    await folder.trigger('dragleave');
    expect(folder.classes()).toContain('ring-2');
    await folder.trigger('dragleave');
    expect(folder.classes()).not.toContain('ring-2');
  });

  it('moves dropped paths without confirmation', async () => {
    mountPane();
    await flushPromises();
    const folder = folderButtons()[1];
    const dt = dataTransfer('C:/a.mp3\nC:/b.mp3');

    await folder.trigger('drop', { dataTransfer: dt, ctrlKey: false });
    expect(state.showConfirm).not.toHaveBeenCalled();
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['C:/a.mp3', 'C:/b.mp3'], 'D:\\Library');
    expect(state.explorer.loadFiles).toHaveBeenCalledWith('C:/Users/me/Desktop');
    expect(state.send).toHaveBeenCalledWith('explorer:refreshAll');
  });

  it('copies with ctrl and honours a confirmed move', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    mountPane();
    await flushPromises();
    const folder = folderButtons()[1];
    const dt = dataTransfer('C:/a.mp3');

    await folder.trigger('drop', { dataTransfer: dt, ctrlKey: true });
    expect(state.showConfirm).toHaveBeenCalledWith(
      `explorer.copyConfirm:${JSON.stringify({ n: 1, dir: 'Library' })}`
    );
    expect(state.invoke).toHaveBeenCalledWith('fs:copy', ['C:/a.mp3'], 'D:\\Library');

    state.invoke.mockClear();
    state.showConfirm.mockClear();
    await folder.trigger('drop', { dataTransfer: dataTransfer('C:/b.mp3') });
    expect(state.showConfirm).toHaveBeenCalledWith(
      `explorer.moveConfirm:${JSON.stringify({ n: 1, dir: 'Library' })}`
    );
    expect(state.invoke).toHaveBeenCalledWith('fs:move', ['C:/b.mp3'], 'D:\\Library');
  });

  it('does nothing when confirmation is declined or the payload is empty', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    state.showConfirm.mockResolvedValue(false);
    mountPane();
    await flushPromises();
    const folder = folderButtons()[0];

    await folder.trigger('drop', { dataTransfer: dataTransfer('C:/a.mp3') });
    expect(state.invoke).not.toHaveBeenCalledWith('fs:move', expect.anything(), expect.anything());
    expect(state.explorer.loadFiles).not.toHaveBeenCalled();
    expect(state.send).not.toHaveBeenCalled();

    await folder.trigger('drop', { dataTransfer: dataTransfer('\n\n') });
    expect(state.showConfirm).toHaveBeenCalledTimes(1);
  });

  it('falls back to the full path when the target has no separator', async () => {
    state.settings.explorer.confirmBeforeMove = true;
    mountPane();
    await flushPromises();
    state.library.folders = ['Music'];
    await wrapper!.vm.$nextTick();

    await folderButtons()[0].trigger('drop', { dataTransfer: dataTransfer('C:/a.mp3') });
    expect(state.showConfirm).toHaveBeenCalledWith(
      `explorer.moveConfirm:${JSON.stringify({ n: 1, dir: 'Music' })}`
    );
  });
});

describe('overlay', () => {
  it('shows the close control and emits close', async () => {
    mountPane({ overlay: true });
    await flushPromises();
    const close = wrapper!.get('[data-testid="explorer-nav-close"]');
    expect(close.attributes('title')).toBe('common.close');
    await close.trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('hides the close control in docked mode', async () => {
    mountPane();
    await flushPromises();
    expect(wrapper!.find('[data-testid="explorer-nav-close"]').exists()).toBe(false);
  });
});
