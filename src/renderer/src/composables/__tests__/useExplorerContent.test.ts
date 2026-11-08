import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useExplorerContent } from '../useExplorerContent';

const state = vi.hoisted(() => ({
  explorer: null as any,
  clipboard: {} as any,
  settings: {} as any,
  fileIcons: { extraSmallIcon: 'icon' },
  drop: null as any,
  band: null as any,
  virtual: null as any,
  rowItems: [] as any[],
  total: 0,
  scrollToIndex: vi.fn(),
  resizeCallback: null as (() => void) | null,
  observe: vi.fn(),
  disconnect: vi.fn()
}));

vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: any) => {
    state.virtual = options;
    return ref({
      getVirtualItems: () => state.rowItems,
      getTotalSize: () => state.total,
      scrollToIndex: state.scrollToIndex
    });
  }
}));
vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => state.explorer }));
vi.mock('@renderer/stores/clipboard', () => ({ useClipboardStore: () => state.clipboard }));
vi.mock('@renderer/stores/settings', () => ({ useSettingsStore: () => state.settings }));
vi.mock('@renderer/composables/useFileIcons', () => ({
  useFileIcons: () => state.fileIcons
}));
vi.mock('@renderer/composables/useExplorerDrop', () => ({
  useExplorerDrop: () => state.drop
}));
vi.mock('@renderer/composables/useExplorerBandSelect', () => ({
  useExplorerBandSelect: () => state.band
}));

function file(name: string) {
  return { name: `${name}.txt`, path: `C:/dir/${name}.txt`, isDirectory: false } as any;
}

let wrapper: VueWrapper | null = null;
let exposed: any;

function setup(files: any[] = [file('a'), file('b'), file('c')]) {
  const props = reactive({ files });
  const showConfirm = vi.fn().mockResolvedValue(true);
  const scrollRef = ref<HTMLElement | null>(document.createElement('div'));
  const Comp = defineComponent({
    setup() {
      exposed = useExplorerContent(props, showConfirm, scrollRef as never);
      return () => h('div');
    }
  });
  wrapper = mount(Comp);
  return { props, showConfirm, scrollRef };
}

beforeEach(() => {
  state.explorer = reactive({
    viewMode: 'medium',
    selectedFiles: new Set<string>(),
    toggleSelect: vi.fn((path: string) => {
      if (state.explorer.selectedFiles.has(path)) state.explorer.selectedFiles.delete(path);
      else state.explorer.selectedFiles.add(path);
    }),
    clearSelection: vi.fn(() => state.explorer.selectedFiles.clear())
  });
  state.drop = {
    contentRef: ref(null),
    hoveredFolderPath: ref(''),
    onContentDragOver: vi.fn(),
    onContentDragLeave: vi.fn(),
    onContentDrop: vi.fn()
  };
  state.band = { bandSelect: ref(null), onBandMouseDown: vi.fn() };
  state.rowItems = [{ index: 0, start: 0 }];
  state.total = 100;
  state.scrollToIndex.mockReset();
  state.observe.mockReset();
  state.disconnect.mockReset();
  state.resizeCallback = null;
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

describe('layout modes', () => {
  it('uses list mode for extraSmall and details', () => {
    setup();
    expect(exposed.isListMode.value).toBe(false);
    expect(exposed.isGridMode.value).toBe(true);

    state.explorer.viewMode = 'extraSmall';
    expect(exposed.isListMode.value).toBe(true);
    expect(exposed.isGridMode.value).toBe(false);

    state.explorer.viewMode = 'details';
    expect(exposed.isListMode.value).toBe(true);
  });

  it('computes items per row for grid modes', () => {
    setup();
    expect(exposed.itemsPerRow.value).toBe(Math.floor((800 + 8) / (108 + 8)));

    state.explorer.viewMode = 'small';
    expect(exposed.itemsPerRow.value).toBe(Math.floor((800 + 4) / (72 + 4)));
    state.explorer.viewMode = 'large';
    expect(exposed.itemsPerRow.value).toBe(Math.floor((800 + 12) / (160 + 12)));
    state.explorer.viewMode = 'extraLarge';
    expect(exposed.itemsPerRow.value).toBe(Math.floor((800 + 16) / (240 + 16)));

    state.explorer.viewMode = 'extraSmall';
    expect(exposed.itemsPerRow.value).toBe(1);
  });

  it('clamps items per row for narrow containers', async () => {
    setup();
    const callback = state.resizeCallback as unknown as (
      entries: { contentRect: { width: number } }[]
    ) => void;
    callback([{ contentRect: { width: 10 } }]);
    await wrapper!.vm.$nextTick();
    state.explorer.viewMode = 'medium';
    expect(exposed.itemsPerRow.value).toBe(1);
  });

  it('computes virtual row counts and heights', () => {
    setup();
    expect(state.virtual.count()).toBe(Math.ceil(3 / exposed.itemsPerRow.value));

    state.explorer.viewMode = 'details';
    expect(state.virtual.count()).toBe(3);
    expect(state.virtual.estimateSize()).toBe(36);

    state.explorer.viewMode = 'extraSmall';
    expect(state.virtual.estimateSize()).toBe(28);

    state.explorer.viewMode = 'large';
    expect(state.virtual.estimateSize()).toBe(118);
    expect(state.virtual.count()).toBe(Math.ceil(3 / exposed.itemsPerRow.value));
  });

  it('slices rows for lists and grids', () => {
    setup();
    expect(exposed.getRowItems(0).map((f: any) => f.name)).toEqual(['a.txt', 'b.txt', 'c.txt']);

    state.explorer.viewMode = 'small';
    const perRow = exposed.itemsPerRow.value;
    expect(exposed.getRowItems(0)).toHaveLength(Math.min(perRow, 3));
    expect(exposed.getRowItems(1)).toEqual([]);

    state.explorer.viewMode = 'details';
    expect(exposed.getRowItems(1)).toEqual([file('b')]);
  });

  it('passes the virtual configuration to the list composable', () => {
    setup();
    expect(state.virtual.count()).toBe(Math.ceil(3 / exposed.itemsPerRow.value));
    expect(state.virtual.estimateSize()).toBe(90);
    expect(state.virtual.overscan).toBe(2);
  });
});

describe('selection', () => {
  it('toggles selection with ctrl and meta', () => {
    setup();
    exposed.onItemClick(new MouseEvent('click', { ctrlKey: true }), 'C:/dir/a.txt', 1);
    expect(state.explorer.toggleSelect).toHaveBeenCalledWith('C:/dir/a.txt');

    exposed.onItemClick(new MouseEvent('click', { metaKey: true }), 'C:/dir/b.txt', 2);
    expect(state.explorer.toggleSelect).toHaveBeenLastCalledWith('C:/dir/b.txt');
  });

  it('selects ranges with shift after an anchor', () => {
    setup();
    exposed.onItemClick(new MouseEvent('click'), 'C:/dir/a.txt', 0);
    exposed.onItemClick(new MouseEvent('click', { shiftKey: true }), 'C:/dir/c.txt', 2);

    expect(state.explorer.clearSelection).toHaveBeenCalled();
    expect([...state.explorer.selectedFiles]).toEqual([
      'C:/dir/a.txt',
      'C:/dir/b.txt',
      'C:/dir/c.txt'
    ]);
  });

  it('selects ranges backwards', () => {
    setup();
    exposed.onItemClick(new MouseEvent('click'), 'C:/dir/c.txt', 2);
    exposed.onItemClick(new MouseEvent('click', { shiftKey: true }), 'C:/dir/a.txt', 0);
    expect([...state.explorer.selectedFiles]).toEqual([
      'C:/dir/a.txt',
      'C:/dir/b.txt',
      'C:/dir/c.txt'
    ]);
  });

  it('falls back to a single selection without an anchor', () => {
    setup();
    exposed.onItemClick(new MouseEvent('click', { shiftKey: true }), 'C:/dir/b.txt', 1);
    expect(state.explorer.selectedFiles.size).toBe(1);
    expect(state.explorer.selectedFiles.has('C:/dir/b.txt')).toBe(true);
  });

  it('replaces the selection on a plain click', () => {
    setup();
    state.explorer.selectedFiles.add('C:/dir/c.txt');
    exposed.onItemClick(new MouseEvent('click'), 'C:/dir/a.txt', 0);
    expect([...state.explorer.selectedFiles]).toEqual(['C:/dir/a.txt']);
  });
});

describe('reveal', () => {
  it('selects and scrolls to a list row', () => {
    setup();
    state.explorer.viewMode = 'details';
    exposed.reveal('C:/dir/b.txt');
    expect(state.explorer.selectedFiles.has('C:/dir/b.txt')).toBe(true);
    expect(state.scrollToIndex).toHaveBeenCalledWith(1, { align: 'center' });
  });

  it('maps grid items to rows', () => {
    setup();
    const perRow = exposed.itemsPerRow.value;
    exposed.reveal('C:/dir/c.txt');
    expect(state.scrollToIndex).toHaveBeenCalledWith(Math.floor(2 / perRow), {
      align: 'center'
    });
  });

  it('selects unknown paths without scrolling', () => {
    setup();
    exposed.reveal('C:/missing.txt');
    expect(state.explorer.selectedFiles.has('C:/missing.txt')).toBe(true);
    expect(state.scrollToIndex).not.toHaveBeenCalled();
  });
});

describe('shared helpers and lifecycle', () => {
  it('exposes drop and band helpers unchanged', () => {
    setup();
    expect(exposed.contentRef).toBe(state.drop.contentRef);
    expect(exposed.hoveredFolderPath).toBe(state.drop.hoveredFolderPath);
    expect(exposed.onContentDragOver).toBe(state.drop.onContentDragOver);
    expect(exposed.onContentDragLeave).toBe(state.drop.onContentDragLeave);
    expect(exposed.onContentDrop).toBe(state.drop.onContentDrop);
    expect(exposed.bandSelect).toBe(state.band.bandSelect);
    expect(exposed.onBandMouseDown).toBe(state.band.onBandMouseDown);
    expect(exposed.extraSmallIcon).toBe('icon');
    expect(exposed.fileClipboard).toBe(state.clipboard);
    expect(exposed.explorer).toBe(state.explorer);
  });

  it('observes the scroll container and updates the width', async () => {
    setup();
    expect(state.observe).toHaveBeenCalled();

    const callback = state.resizeCallback as unknown as (
      entries: { contentRect: { width: number } }[]
    ) => void;
    callback([{ contentRect: { width: 400 } }]);
    await wrapper!.vm.$nextTick();
    state.explorer.viewMode = 'medium';
    expect(exposed.itemsPerRow.value).toBe(Math.floor((400 + 8) / (108 + 8)));
  });

  it('disconnects the observer on unmount', () => {
    setup();
    wrapper!.unmount();
    wrapper = null;
    expect(state.disconnect).toHaveBeenCalled();
  });

  it('does nothing when the scroll ref is absent', () => {
    const props = reactive({ files: [file('a')] });
    const showConfirm = vi.fn();
    const scrollRef = ref<HTMLElement | null>(null);
    const Comp = defineComponent({
      setup() {
        exposed = useExplorerContent(props, showConfirm, scrollRef as never);
        return () => h('div');
      }
    });
    wrapper = mount(Comp);
    expect(state.observe).not.toHaveBeenCalled();
  });
});
