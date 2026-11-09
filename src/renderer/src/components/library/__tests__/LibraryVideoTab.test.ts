import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const state = vi.hoisted(() => ({
  listCalls: [] as any[],
  list: { items: [] as any[], total: 0 },
  gridRows: { items: [] as any[], total: 0 },
  cols: null as any,
  observe: vi.fn(),
  destroy: vi.fn(),
  fileCount: vi.fn((n: number) => `${n} files`)
}));

vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: any) => {
    state.listCalls.push(options);
    const target = state.listCalls.length === 1 ? state.list : state.gridRows;
    return ref({
      getVirtualItems: () => target.items,
      getTotalSize: () => target.total,
      measureElement: vi.fn()
    });
  }
}));
vi.mock('@renderer/composables/useVirtualGrid', () => ({
  useVirtualGrid: () => ({
    cols: state.cols,
    observe: state.observe,
    destroy: state.destroy
  })
}));
vi.mock('@renderer/composables/useCountLabel', () => ({
  useCountLabel: () => ({ fileCount: state.fileCount })
}));

const RowStub = defineComponent({
  name: 'LibraryVideoRowStub',
  props: { track: Object },
  emits: ['play'],
  template: '<button data-testid="video-row" @click="$emit(\'play\', track)" />'
});
const CardStub = defineComponent({
  name: 'VideoCardStub',
  props: { track: Object },
  emits: ['play'],
  template: '<button data-testid="video-card" @click="$emit(\'play\', track)" />'
});

import LibraryVideoTab from '../LibraryVideoTab.vue';

let wrapper: VueWrapper | null = null;

function track(name: string) {
  return { id: name, name, path: `D:/video/${name}`, isDirectory: false } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(LibraryVideoTab, {
    props: { tracks: [track('a.mp4'), track('b.mp4')], viewMode: 'list', ...props },
    global: {
      stubs: { LibraryVideoRow: RowStub, VideoCard: CardStub },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.listCalls = [];
  state.list = { items: [], total: 0 };
  state.gridRows = { items: [], total: 0 };
  state.cols = ref(2);
  state.observe.mockReset();
  state.destroy.mockReset();
  state.fileCount.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('empty state', () => {
  it('shows a hint without videos', () => {
    setup({ tracks: [] });

    expect(wrapper!.text()).toContain('library.noVideo');
    expect(wrapper!.text()).toContain('library.addFolderHint');
    expect(wrapper!.find('[data-testid="video-row"]').exists()).toBe(false);
  });
});

describe('toolbar', () => {
  it('renders the count and view controls', () => {
    setup();

    expect(wrapper!.text()).toContain('2 files');
    expect(state.fileCount).toHaveBeenCalledWith(2);
    const buttons = wrapper!.findAll('button');
    expect(buttons[0].classes()).toContain('bg-primary/10');
    expect(buttons[1].classes()).not.toContain('bg-primary/10');
  });

  it('switches the view mode and plays everything', async () => {
    setup();
    const buttons = wrapper!.findAll('button');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');

    expect(wrapper!.emitted('update:viewMode')).toEqual([['list'], ['grid']]);
    expect(wrapper!.emitted('playAll')).toHaveLength(1);
  });

  it('marks the grid mode active', () => {
    setup({ viewMode: 'grid' });
    const buttons = wrapper!.findAll('button');
    expect(buttons[1].classes()).toContain('bg-primary/10');
  });
});

describe('list mode', () => {
  it('renders virtual rows and forwards playback', async () => {
    state.list = {
      items: [
        { index: 0, key: 'a', start: 0, size: 48 },
        { index: 1, key: 'b', start: 48, size: 48 }
      ],
      total: 96
    };
    setup();

    const rows = wrapper!.findAll('[data-testid="video-row"]');
    expect(rows).toHaveLength(2);
    const row = wrapper!
      .findAll('div')
      .find((node) => node.attributes('style')?.includes('height: 96px'))!;
    expect(row).toBeTruthy();

    await rows[1].trigger('click');
    expect(wrapper!.emitted('play')).toEqual([[track('b.mp4')]]);
  });

  it('applies row positions', () => {
    state.list = {
      items: [{ index: 1, key: 'b', start: 48, size: 48 }],
      total: 96
    };
    setup();

    const row = wrapper!.get('[data-testid="video-row"]').element.parentElement!;
    expect((row as HTMLElement).style.transform).toBe('translateY(48px)');
    expect((row as HTMLElement).style.height).toBe('48px');
  });

  it('configures the list virtualizer', () => {
    setup();
    const options = state.listCalls[0];

    expect(options.count()).toBe(2);
    expect(options.estimateSize()).toBe(48);
    expect(options.overscan).toBe(10);
    expect(options.scrollEl()).toBeTruthy();
  });
});

describe('grid mode', () => {
  it('slices rows by column count', () => {
    state.gridRows = {
      items: [
        { index: 0, start: 0 },
        { index: 1, start: 220 }
      ],
      total: 440
    };
    setup({
      viewMode: 'grid',
      tracks: [track('a.mp4'), track('b.mp4'), track('c.mp4'), track('d.mp4'), track('e.mp4')]
    });

    const cards = wrapper!.findAll('[data-testid="video-card"]');
    expect(cards).toHaveLength(4);
    const row = wrapper!
      .findAll('div')
      .find((node) => node.attributes('style')?.includes('height: 440px'))!;
    expect(row).toBeTruthy();
  });

  it('forwards card playback', async () => {
    state.gridRows = { items: [{ index: 0, start: 0 }], total: 220 };
    setup({ viewMode: 'grid' });

    await wrapper!.findAll('[data-testid="video-card"]')[0].trigger('click');
    expect(wrapper!.emitted('play')).toEqual([[track('a.mp4')]]);
  });

  it('configures the row virtualizer from the column count', () => {
    state.cols = ref(3);
    setup({ viewMode: 'grid' });
    const options = state.listCalls[1];

    expect(options.count()).toBe(1);
    expect(options.estimateSize()).toBe(220);
    expect(options.overscan).toBe(3);
  });

  it('recomputes visible rows when columns change', async () => {
    state.gridRows = { items: [{ index: 0, start: 0 }], total: 220 };
    setup({
      viewMode: 'grid',
      tracks: [track('a.mp4'), track('b.mp4'), track('c.mp4'), track('d.mp4')]
    });
    expect(wrapper!.findAll('[data-testid="video-card"]')).toHaveLength(2);

    state.cols.value = 3;
    await wrapper!.vm.$nextTick();

    expect(wrapper!.findAll('[data-testid="video-card"]')).toHaveLength(3);
  });
});

describe('lifecycle', () => {
  it('observes the grid on mount and destroys on unmount', () => {
    setup();
    expect(state.observe).toHaveBeenCalledTimes(1);

    wrapper!.unmount();
    wrapper = null;
    expect(state.destroy).toHaveBeenCalledTimes(1);
  });
});
