import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';
import LibraryImagesTab from '../LibraryImagesTab.vue';

const state = vi.hoisted(() => ({
  items: [] as any[],
  total: 300,
  measure: vi.fn(),
  showImageMenu: vi.fn(),
  request: vi.fn(),
  getThumb: vi.fn(),
  fileCount: vi.fn((count: number) => `files:${count}`),
  t: vi.fn((key: string) => key),
  resizeCallback: null as (() => void) | null,
  disconnect: vi.fn(),
  observe: vi.fn()
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showImageMenu: state.showImageMenu })
}));
vi.mock('@renderer/composables/useThumbnails', () => ({
  useThumbnails: () => ({ request: state.request, getThumb: state.getThumb })
}));
vi.mock('@renderer/composables/useCountLabel', () => ({
  useCountLabel: () => ({ fileCount: state.fileCount })
}));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: () =>
    ref({
      getVirtualItems: () => state.items,
      getTotalSize: () => state.total,
      measure: state.measure
    })
}));

let wrapper: VueWrapper | null = null;

function image(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `${id}.png`,
    path: `C:/images/${id}.png`,
    type: 'image',
    addedAt: 0,
    ...overrides
  } as any;
}

function mountTab(images: any[]) {
  wrapper = mount(LibraryImagesTab, {
    props: { images },
    global: { mocks: { $t: (key: string) => key } }
  });
  return wrapper;
}

beforeEach(() => {
  state.items = [{ index: 0, start: 0 }];
  state.total = 300;
  state.measure.mockReset();
  state.showImageMenu.mockReset();
  state.request.mockReset();
  state.getThumb.mockReset();
  state.getThumb.mockImplementation((path: string) =>
    path.includes('thumb') ? `thumb-url:${path}` : ''
  );
  state.fileCount.mockClear();
  state.resizeCallback = null;
  state.disconnect.mockReset();
  state.observe.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        state.resizeCallback = callback;
      }
      observe = state.observe;
      disconnect = state.disconnect;
    }
  );
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('empty state', () => {
  it('renders hints without images', () => {
    mountTab([]);
    expect(wrapper!.text()).toContain('library.noImages');
    expect(wrapper!.text()).toContain('library.addFolderHint');
    expect(wrapper!.findAll('button')).toHaveLength(0);
  });
});

describe('image grid', () => {
  it('renders the file count and virtual rows', () => {
    state.items = [
      { index: 0, start: 0 },
      { index: 1, start: 200 }
    ];
    mountTab([image('a'), image('b'), image('c')]);

    expect(state.fileCount).toHaveBeenCalledWith(3);
    expect(wrapper!.text()).toContain('files:3');
    expect(wrapper!.findAll('button')).toHaveLength(3);
    const rows = wrapper!.findAll('div[style*="position: absolute"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].attributes('style')).toContain('top: 0px');
    expect(rows[1].attributes('style')).toContain('top: 200px');
  });

  it('caps the last row to the available images', async () => {
    state.items = [{ index: 1, start: 200 }];
    mountTab([image('a'), image('b'), image('c')]);
    await wrapper!.vm.$nextTick();
    // Columns fall back to two in jsdom (clientWidth = 0).
    expect(wrapper!.findAll('button')).toHaveLength(1);
  });

  it('requests thumbnails for visible paths', () => {
    state.items = [
      { index: 0, start: 0 },
      { index: 1, start: 200 }
    ];
    mountTab([image('a'), image('b'), image('c')]);
    expect(state.request).toHaveBeenCalledWith([
      'C:/images/a.png',
      'C:/images/b.png',
      'C:/images/c.png'
    ]);
  });

  it('shows thumbnail images only when available', () => {
    state.items = [{ index: 0, start: 0 }];
    mountTab([image('thumb-a'), image('plain-b')]);

    const imgs = wrapper!.findAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].attributes('src')).toBe('thumb-url:C:/images/thumb-a.png');
    expect(imgs[0].attributes('alt')).toBe('thumb-a.png');
    expect(wrapper!.text()).toContain('plain-b.png');
  });

  it('uses the computed cell width for buttons', async () => {
    state.items = [{ index: 0, start: 0 }];
    mountTab([image('a')]);
    await wrapper!.vm.$nextTick();
    expect(wrapper!.get('button').attributes('style')).toContain('width: 120px');
  });

  it('opens images on double click with the absolute index', async () => {
    state.items = [{ index: 1, start: 200 }];
    mountTab([image('a'), image('b'), image('c')]);
    await wrapper!.vm.$nextTick();
    await wrapper!.get('button').trigger('dblclick');
    expect(wrapper!.emitted('open')?.[0]).toEqual([2]);
  });

  it('opens the context menu and forwards the opener', async () => {
    state.items = [{ index: 0, start: 0 }];
    const images = [image('a'), image('b')];
    mountTab(images);

    await wrapper!.findAll('button')[1].trigger('contextmenu');
    const [event, file, open] = state.showImageMenu.mock.calls[0];
    expect(event).toBeInstanceOf(MouseEvent);
    expect(file).toMatchObject({ path: images[1].path });

    open();
    expect(wrapper!.emitted('open')?.[0]).toEqual([1]);
  });
});

describe('column observation', () => {
  it('observes the grid and remeasures on resize', async () => {
    const { nextTick } = await import('vue');
    mountTab([image('a'), image('b'), image('c')]);
    await wrapper!.vm.$nextTick();
    expect(state.observe).toHaveBeenCalled();

    const grid = wrapper!.get('.flex-1.overflow-auto.p-4');
    Object.defineProperty(grid.element, 'clientWidth', { configurable: true, value: 800 });
    state.resizeCallback?.();
    await nextTick();

    expect(state.measure).toHaveBeenCalled();
    const buttons = wrapper!.findAll('button');
    expect(buttons[0].attributes('style')).toContain('width: 180px');
  });

  it('keeps two columns for narrow containers', async () => {
    const { nextTick } = await import('vue');
    mountTab([image('a')]);
    await nextTick();
    const grid = wrapper!.get('.flex-1.overflow-auto.p-4');
    Object.defineProperty(grid.element, 'clientWidth', { configurable: true, value: 300 });
    state.resizeCallback?.();
    await nextTick();
    expect(wrapper!.get('button').attributes('style')).toContain('width: 122px');
  });

  it('disconnects the observer on unmount', async () => {
    mountTab([image('a')]);
    await wrapper!.vm.$nextTick();
    wrapper!.unmount();
    wrapper = null;
    expect(state.disconnect).toHaveBeenCalled();
  });
});
