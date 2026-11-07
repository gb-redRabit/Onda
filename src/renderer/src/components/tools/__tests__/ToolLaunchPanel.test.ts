import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import ToolLaunchPanel from '../ToolLaunchPanel.vue';

const state = vi.hoisted(() => ({
  explorer: null as any,
  library: null as any,
  files: null as any,
  loading: null as any,
  onError: null as any,
  load: vi.fn(async () => undefined),
  cancel: vi.fn(),
  dropped: [] as string[],
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/utils/explorerLoader', () => ({
  createBatchLoader: (files: unknown, loading: unknown, onError: unknown) => {
    state.files = files;
    state.loading = loading;
    state.onError = onError;
    return { load: state.load, cancel: state.cancel };
  }
}));
vi.mock('@renderer/utils/fileDrag', () => ({
  getDroppedFilePaths: () => state.dropped
}));

const ButtonStub = {
  props: ['variant', 'disabled', 'loading'],
  emits: ['click'],
  template:
    '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
};
const SpinnerStub = { template: '<span data-testid="spinner" />' };
const EmptyStateStub = {
  props: ['title', 'description', 'icon'],
  template: '<div data-testid="empty">{{ title }}</div>'
};

let wrapper: VueWrapper | null = null;

function fileItem(name: string, path: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    path,
    isDirectory: false,
    extension: name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '',
    size: 2048,
    ...overrides
  };
}

function folder(name: string, path: string) {
  return { name, path, isDirectory: true, extension: '' };
}

function mountPanel(props: Record<string, unknown> = {}) {
  wrapper = mount(ToolLaunchPanel, {
    props: { toolId: 'converter', ...props } as never,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Button: ButtonStub, Spinner: SpinnerStub, EmptyState: EmptyStateStub }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function items() {
  return wrapper!.findAll('[data-testid^="tool-launch-item-"]');
}

function item(name: string) {
  return wrapper!.get(`[data-testid="tool-launch-item-${name}"]`);
}

function selected() {
  return wrapper!.findAll('[data-testid="tool-launch-selected"]');
}

beforeEach(() => {
  state.explorer = reactive({ currentPath: 'D:\\Music' });
  state.library = reactive({ folders: ['D:\\Library'] });
  state.load.mockClear();
  state.cancel.mockClear();
  state.dropped = [];
  state.t.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('mounting and listing', () => {
  it('loads the explorer path on mount and shows the tool title', async () => {
    mountPanel();
    await flush();

    expect(state.load).toHaveBeenCalledWith('D:\\Music');
    expect(wrapper!.text()).toContain('tools.converterTitle');
    expect(wrapper!.text()).toContain('tools.launchHint');
  });

  it('falls back to the first library folder when no explorer path is set', async () => {
    state.explorer.currentPath = '';
    mountPanel();
    await flush();
    expect(state.load).toHaveBeenCalledWith('D:\\Library');
  });

  it('shows folders first, then accepted files sorted naturally', async () => {
    mountPanel();
    await flush();
    state.files.value = [
      fileItem('b.mp3', 'D:\\Music\\b.mp3'),
      folder('Zeta', 'D:\\Music\\Zeta'),
      fileItem('a.mp4', 'D:\\Music\\a.mp4'),
      fileItem('doc.txt', 'D:\\Music\\doc.txt'),
      folder('Alpha', 'D:\\Music\\Alpha')
    ];
    await wrapper!.vm.$nextTick();

    expect(items().map((i) => i.text())).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Zeta'),
      expect.stringContaining('a.mp4'),
      expect.stringContaining('b.mp3')
    ]);
    expect(wrapper!.text()).toContain('4');
  });

  it('renders loading, error and empty states', async () => {
    mountPanel();
    await flush();
    state.loading.value = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="spinner"]').exists()).toBe(true);

    state.loading.value = false;
    state.onError('permission denied');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('permission denied');

    state.onError(null);
    state.files.value = [];
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="empty"]').text()).toBe('tools.launchEmptyDir');
  });

  it('cancels the loader on unmount', async () => {
    mountPanel();
    await flush();
    wrapper!.unmount();
    wrapper = null;
    expect(state.cancel).toHaveBeenCalled();
  });
});

describe('navigation', () => {
  it('navigates into folders and follows breadcrumbs', async () => {
    mountPanel();
    await flush();
    state.files.value = [folder('Sub', 'D:\\Music\\Sub')];
    await wrapper!.vm.$nextTick();

    await item('Sub').trigger('click');
    expect(state.load).toHaveBeenLastCalledWith('D:\\Music\\Sub');
    expect(wrapper!.text()).toContain('Sub');

    const crumb = wrapper!.findAll('button').find((b) => b.text() === 'Music')!;
    await crumb.trigger('click');
    expect(state.load).toHaveBeenLastCalledWith('D:/Music');
  });

  it('goes up from a subfolder', async () => {
    state.explorer.currentPath = 'D:\\Music\\Sub';
    mountPanel();
    await flush();

    await wrapper!.get('[data-testid="tool-launch-up"]').trigger('click');
    expect(state.load).toHaveBeenLastCalledWith('D:\\Music');
  });

  it('normalises a drive root when going up', async () => {
    state.explorer.currentPath = 'D:\\Music';
    mountPanel();
    await flush();

    await wrapper!.get('[data-testid="tool-launch-up"]').trigger('click');
    expect(state.load).toHaveBeenLastCalledWith('D:/');
  });

  it('returns to the drives view and disables up at the root', async () => {
    mountPanel();
    await flush();

    await wrapper!.get('[data-testid="tool-launch-drives"]').trigger('click');
    expect(state.load).toHaveBeenLastCalledWith('');
    expect(wrapper!.get('[data-testid="tool-launch-up"]').attributes('disabled')).toBeDefined();
  });
});

describe('selection', () => {
  function selectionFiles() {
    return [
      fileItem('song.mp3', 'D:\\Music\\song.mp3'),
      fileItem('song2.mp3', 'D:\\Music\\song2.mp3'),
      fileItem('clip.mp4', 'D:\\Music\\clip.mp4'),
      fileItem('clip2.mp4', 'D:\\Music\\clip2.mp4'),
      fileItem('doc.txt', 'D:\\Music\\doc.txt')
    ];
  }

  async function mountWithFiles(props: Record<string, unknown> = {}) {
    mountPanel(props);
    await flush();
    state.files.value = selectionFiles();
    await wrapper!.vm.$nextTick();
  }

  it('toggles files and reports their kind and size', async () => {
    await mountWithFiles();

    await item('song.mp3').trigger('click');
    expect(
      wrapper!.get('[data-testid="tool-launch-item-song.mp3"]').attributes('aria-pressed')
    ).toBe('true');
    expect(selected()).toHaveLength(1);
    expect(selected()[0].text()).toContain('song.mp3');
    expect(selected()[0].text()).toContain('tools.audio');
    expect(selected()[0].text()).toContain('2 KB');

    await item('song.mp3').trigger('click');
    expect(selected()).toHaveLength(0);
  });

  it('allows multiple files for the converter and disables start while empty', async () => {
    await mountWithFiles();

    const start = wrapper!.get('[data-testid="tool-launch-start"]');
    expect(start.attributes('disabled')).toBeDefined();

    await item('song.mp3').trigger('click');
    await item('song2.mp3').trigger('click');
    expect(selected()).toHaveLength(2);
    expect(start.attributes('disabled')).toBeUndefined();

    await start.trigger('click');
    expect(wrapper!.emitted('launch')?.[0]?.[0]).toEqual([
      'D:\\Music\\song.mp3',
      'D:\\Music\\song2.mp3'
    ]);
  });

  it('locks the converter to the first selected kind', async () => {
    await mountWithFiles();

    await item('song.mp3').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="tool-launch-item-clip.mp4"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="tool-launch-item-song.mp3"]').exists()).toBe(true);

    await item('song.mp3').trigger('click');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="tool-launch-item-clip.mp4"]').exists()).toBe(true);
  });

  it('replaces the selection for single-file tools', async () => {
    await mountWithFiles({ toolId: 'video-clipper' });

    await item('clip.mp4').trigger('click');
    expect(selected()).toHaveLength(1);

    await item('clip2.mp4').trigger('click');
    expect(selected()).toHaveLength(1);
    expect(selected()[0].text()).toContain('clip2.mp4');
  });

  it('removes selected files from the side panel', async () => {
    await mountWithFiles();
    await item('song.mp3').trigger('click');

    await wrapper!.get('[aria-label="tools.launchRemove"]').trigger('click');
    expect(selected()).toHaveLength(0);
    expect(item('song.mp3').attributes('aria-pressed')).toBe('false');
  });

  it('starts empty and respects the busy flag', async () => {
    mountPanel({ busy: true });
    await flush();

    const start = wrapper!.get('[data-testid="tool-launch-start"]');
    const skip = wrapper!.get('[data-testid="tool-launch-skip"]');
    expect(start.attributes('disabled')).toBeDefined();
    expect(skip.attributes('disabled')).toBeDefined();

    expect(wrapper!.text()).toContain('tools.launchNothingSelected');
  });

  it('opens the tool empty and cancels from the back button', async () => {
    mountPanel();
    await flush();

    await wrapper!.get('[data-testid="tool-launch-skip"]').trigger('click');
    expect(wrapper!.emitted('launch')?.[0]?.[0]).toEqual([]);

    await wrapper!.get('[data-testid="tool-launch-back"]').trigger('click');
    expect(wrapper!.emitted('cancel')).toHaveLength(1);
  });
});

describe('dropping files', () => {
  it('adds accepted dropped paths, skipping rejected and duplicate ones', async () => {
    mountPanel();
    await flush();
    state.files.value = [fileItem('doc.txt', 'D:\\Music\\doc.txt')];
    state.dropped = ['D:\\Drop\\a.mp3', 'D:\\Drop\\note.txt', 'D:\\Drop\\a.mp3'];
    await wrapper!.vm.$nextTick();

    await wrapper!.find('.overflow-auto').trigger('drop', { dataTransfer: {} });
    expect(selected()).toHaveLength(1);
    expect(selected()[0].text()).toContain('a.mp3');
    expect(selected()[0].text()).toContain('tools.audio');
  });

  it('ignores empty drops and enforces the locked kind', async () => {
    mountPanel();
    await flush();
    state.files.value = [fileItem('song.mp3', 'D:\\Music\\song.mp3')];
    await wrapper!.vm.$nextTick();

    state.dropped = [];
    await wrapper!.find('.overflow-auto').trigger('drop', { dataTransfer: {} });
    expect(selected()).toHaveLength(0);

    await item('song.mp3').trigger('click');
    await wrapper!.vm.$nextTick();

    state.dropped = ['D:\\Drop\\clip.mp4'];
    await wrapper!.find('.overflow-auto').trigger('drop', { dataTransfer: {} });
    expect(selected()).toHaveLength(1);
    expect(selected()[0].text()).toContain('song.mp3');
  });
});
