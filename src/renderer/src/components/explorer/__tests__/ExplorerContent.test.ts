import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';

const h = vi.hoisted(() => ({
  explorer: null as any,
  fileClipboard: { isCut: vi.fn((..._args: any[]) => false) },
  contentRef: null as any,
  hoveredFolderPath: null as any,
  extraSmallIcon: vi.fn((..._args: any[]) => null as string | null),
  isGridMode: true,
  itemsPerRow: 2,
  rows: [{ index: 0, start: 0, size: 50 }],
  bandSelect: null as any,
  onItemClick: vi.fn(),
  onContentDragOver: vi.fn(),
  onContentDragLeave: vi.fn(),
  onContentDrop: vi.fn(),
  onBandMouseDown: vi.fn(),
  reveal: vi.fn(),
  beginFileDrag: vi.fn(),
  isLibraryFolder: vi.fn(() => true),
  showConfirm: null as any
}));

vi.mock('@renderer/composables/useExplorerContent', async () => {
  const { computed, ref: createRef } = await import('vue');
  h.contentRef = createRef(null);
  h.hoveredFolderPath = createRef(null);
  h.bandSelect = createRef(null);
  return {
    useExplorerContent: (props: { files: unknown[] }, showConfirm: () => Promise<boolean>) => {
      h.showConfirm = showConfirm;
      return {
        files: computed(() => props.files),
        explorer: h.explorer,
        fileClipboard: h.fileClipboard,
        contentRef: h.contentRef,
        hoveredFolderPath: h.hoveredFolderPath,
        extraSmallIcon: h.extraSmallIcon,
        isGridMode: computed(() => h.isGridMode),
        itemsPerRow: h.itemsPerRow,
        getRowItems: (index: number) =>
          props.files.slice(index * h.itemsPerRow, (index + 1) * h.itemsPerRow),
        virtualizer: {
          getTotalSize: () => h.rows.length * 50,
          getVirtualItems: () => h.rows
        },
        GRID_ITEM_WIDTHS: {
          extraSmall: 40,
          small: 80,
          medium: 120,
          large: 160,
          extraLarge: 200,
          details: 0
        },
        GRID_GAPS: {
          extraSmall: 2,
          small: 8,
          medium: 10,
          large: 12,
          extraLarge: 16,
          details: 0
        },
        bandSelect: h.bandSelect,
        onItemClick: h.onItemClick,
        onContentDragOver: h.onContentDragOver,
        onContentDragLeave: h.onContentDragLeave,
        onContentDrop: h.onContentDrop,
        onBandMouseDown: h.onBandMouseDown,
        reveal: h.reveal
      };
    }
  };
});
vi.mock('@renderer/utils/libraryFolders', () => ({ isLibraryFolder: h.isLibraryFolder }));
vi.mock('@renderer/utils/fileDrag', () => ({ beginFileDrag: h.beginFileDrag }));

vi.mock('../ExplorerGridItem.vue', async () => {
  const { defineComponent } = await import('vue');
  return {
    default: defineComponent({
      name: 'ExplorerGridItem',
      props: [
        'item',
        'viewMode',
        'isSelected',
        'isDriveList',
        'isLibraryFolder',
        'hoveredFolderPath',
        'isCut'
      ],
      emits: ['select', 'doubleClick', 'contextMenu'],
      template: '<button data-testid="grid-item" />'
    })
  };
});
vi.mock('../ExplorerTableRow.vue', async () => {
  const { defineComponent } = await import('vue');
  return {
    default: defineComponent({
      name: 'ExplorerTableRow',
      props: ['item', 'isSelected', 'isDriveList', 'hoveredFolderPath', 'isCut'],
      emits: ['select', 'doubleClick', 'contextMenu'],
      template: '<button data-testid="table-row" />'
    })
  };
});
vi.mock('../ExplorerDetailsHeader.vue', async () => {
  const { defineComponent } = await import('vue');
  return {
    default: defineComponent({
      name: 'ExplorerDetailsHeader',
      props: ['sortBy', 'sortOrder'],
      emits: ['sort'],
      template: '<div data-testid="details-header" />'
    })
  };
});

import ExplorerGridItem from '../ExplorerGridItem.vue';
import ExplorerTableRow from '../ExplorerTableRow.vue';
import ExplorerDetailsHeader from '../ExplorerDetailsHeader.vue';
import ExplorerContent from '../ExplorerContent.vue';

const LoaderStub = defineComponent({
  name: 'Loader',
  props: ['size', 'label'],
  template: '<div data-testid="loader" />'
});

let wrapper: VueWrapper | null = null;

function item(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    path: `D:/music/${name}`,
    isDirectory: false,
    extension: 'mp3',
    size: 10,
    ...overrides
  } as never;
}

function setup(props: Record<string, unknown> = {}) {
  wrapper = mount(ExplorerContent, {
    props: { files: [item('a.mp3'), item('b.mp3')], ...props },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Loader: LoaderStub }
    }
  });
  return wrapper;
}

function root() {
  return wrapper!.get('.flex-1.overflow-auto');
}

beforeEach(() => {
  h.explorer = reactive({
    isLoading: false,
    loadError: '',
    viewMode: 'small',
    isDriveList: false,
    selectedFiles: new Set<string>(),
    sortBy: 'name',
    sortOrder: 'asc',
    toggleSort: vi.fn()
  });
  h.fileClipboard.isCut.mockReset();
  h.fileClipboard.isCut.mockReturnValue(false);
  h.extraSmallIcon.mockReset();
  h.extraSmallIcon.mockReturnValue(null);
  h.isGridMode = true;
  h.itemsPerRow = 2;
  h.rows = [{ index: 0, start: 0, size: 50 }];
  h.bandSelect.value = null;
  h.hoveredFolderPath.value = null;
  h.contentRef.value = null;
  h.onItemClick.mockReset();
  h.onContentDragOver.mockReset();
  h.onContentDragLeave.mockReset();
  h.onContentDrop.mockReset();
  h.onBandMouseDown.mockReset();
  h.reveal.mockReset();
  h.beginFileDrag.mockReset();
  h.isLibraryFolder.mockReset();
  h.isLibraryFolder.mockReturnValue(true);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('states', () => {
  it('shows the load error', () => {
    h.explorer.loadError = 'access denied';
    setup({ files: [] });

    expect(wrapper!.get('[data-testid="explorer-load-error"]').text()).toContain('access denied');
  });

  it('shows the empty folder state', () => {
    setup({ files: [] });
    expect(wrapper!.text()).toContain('explorer.folderEmpty');
  });

  it('shows a loader while loading an empty folder', () => {
    h.explorer.isLoading = true;
    setup({ files: [] });

    expect(wrapper!.find('[data-testid="loader"]').exists()).toBe(true);
    expect(root().classes()).toContain('cursor-progress');
  });

  it('shows the drives header for drive lists', () => {
    h.explorer.isDriveList = true;
    setup();
    expect(wrapper!.text()).toContain('explorer.drives');
  });
});

describe('extraSmall list', () => {
  beforeEach(() => {
    h.explorer.viewMode = 'extraSmall';
    h.isGridMode = false;
    h.rows = [
      { index: 0, start: 0, size: 50 },
      { index: 1, start: 50, size: 50 }
    ];
  });

  it('renders virtual rows and icons', () => {
    h.extraSmallIcon.mockImplementation((file: { name: string }) =>
      file.name === 'a.mp3' ? 'icon.png' : null
    );
    setup();

    const buttons = wrapper!.findAll('[data-testid^="explorer-item-"]');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].find('img').attributes('src')).toBe('icon.png');
    expect(buttons[1].find('svg').exists()).toBe(true);
  });

  it('renders drive and folder icons', () => {
    h.explorer.isDriveList = true;
    setup({
      files: [item('C:'), item('folder', { isDirectory: true, extension: '' })]
    });

    const buttons = wrapper!.findAll('[data-testid^="explorer-item-"]');
    expect(buttons[0].find('svg').exists()).toBe(true);
    expect(buttons[1].find('svg').exists()).toBe(true);
  });

  it('forwards clicks, double clicks and context menus', async () => {
    setup();
    const button = wrapper!.get('[data-testid="explorer-item-a.mp3"]');

    await button.trigger('click');
    await button.trigger('dblclick');
    await button.trigger('contextmenu');

    expect(h.onItemClick).toHaveBeenCalledWith(expect.any(MouseEvent), 'D:/music/a.mp3', 0);
    expect(wrapper!.emitted('open')).toHaveLength(1);
    expect(wrapper!.emitted('menu')).toHaveLength(1);
  });

  it('drags selected files or just the row', async () => {
    setup();
    const button = wrapper!.get('[data-testid="explorer-item-a.mp3"]');

    await button.trigger('dragstart');
    expect(h.beginFileDrag).toHaveBeenLastCalledWith(expect.any(Event), ['D:/music/a.mp3']);

    h.explorer.selectedFiles = new Set(['D:/music/a.mp3', 'D:/music/b.mp3']);
    await wrapper!.vm.$nextTick();
    await button.trigger('dragstart');
    expect(h.beginFileDrag).toHaveBeenLastCalledWith(expect.any(Event), [
      'D:/music/a.mp3',
      'D:/music/b.mp3'
    ]);
  });

  it('marks selected, hovered and cut rows', async () => {
    h.explorer.selectedFiles = new Set(['D:/music/a.mp3']);
    h.fileClipboard.isCut.mockImplementation((path: string) => path.includes('b'));
    setup();

    const selected = wrapper!.get('[data-testid="explorer-item-a.mp3"]');
    const cut = wrapper!.get('[data-testid="explorer-item-b.mp3"]');
    expect(selected.classes()).toContain('bg-primary/12');
    expect(cut.classes()).toContain('opacity-40');

    h.hoveredFolderPath.value = 'D:/music/b.mp3';
    await wrapper!.vm.$nextTick();
    expect(cut.classes()).toContain('ring-primary');
  });
});

describe('grid view', () => {
  it('renders grid items with flags and forwards events', async () => {
    h.explorer.selectedFiles = new Set(['D:/music/b.mp3']);
    h.fileClipboard.isCut.mockImplementation((path: string) => path.includes('a'));
    setup();
    const items = wrapper!.findAllComponents(ExplorerGridItem);

    expect(items).toHaveLength(2);
    expect(items[0].props()).toMatchObject({
      isSelected: false,
      isCut: true,
      isDriveList: false,
      isLibraryFolder: false,
      hoveredFolderPath: null
    });
    expect(items[1].props('isSelected')).toBe(true);

    items[0].vm.$emit('select', 'D:/music/a.mp3', new MouseEvent('click'));
    items[0].vm.$emit('doubleClick', expect.anything());
    items[0].vm.$emit('contextMenu', new MouseEvent('contextmenu'), item('a.mp3'));
    await wrapper!.vm.$nextTick();

    expect(h.onItemClick).toHaveBeenCalledWith(expect.any(MouseEvent), 'D:/music/a.mp3', 0);
    expect(wrapper!.emitted('open')).toHaveLength(1);
    expect(wrapper!.emitted('menu')).toHaveLength(1);
  });

  it('computes the selection index from the row and column', async () => {
    h.rows = [
      { index: 0, start: 0, size: 50 },
      { index: 1, start: 50, size: 50 }
    ];
    setup({ files: [item('a.mp3'), item('b.mp3'), item('c.mp3'), item('d.mp3')] });
    const items = wrapper!.findAllComponents(ExplorerGridItem);

    items[2].vm.$emit('select', 'D:/music/c.mp3', new MouseEvent('click'));

    expect(h.onItemClick).toHaveBeenCalledWith(expect.any(MouseEvent), 'D:/music/c.mp3', 2);
  });

  it('marks library folders for directories', () => {
    setup({ files: [item('folder', { isDirectory: true })] });
    expect(wrapper!.findComponent(ExplorerGridItem).props('isLibraryFolder')).toBe(true);
  });
});

describe('details view', () => {
  beforeEach(() => {
    h.explorer.viewMode = 'details';
    h.isGridMode = false;
    h.rows = [
      { index: 0, start: 0, size: 50 },
      { index: 1, start: 50, size: 50 }
    ];
  });

  it('renders the header and forwards sorting', async () => {
    setup();
    const header = wrapper!.findComponent(ExplorerDetailsHeader);

    expect(header.props()).toMatchObject({ sortBy: 'name', sortOrder: 'asc' });
    header.vm.$emit('sort');
    expect(h.explorer.toggleSort).toHaveBeenCalled();
  });

  it('renders rows and forwards their events', async () => {
    setup();
    const rows = wrapper!.findAllComponents(ExplorerTableRow);
    expect(rows).toHaveLength(2);

    rows[1].vm.$emit('select', 'D:/music/b.mp3', new MouseEvent('click'));
    rows[0].vm.$emit('doubleClick', item('a.mp3'));
    rows[0].vm.$emit('contextMenu', new MouseEvent('contextmenu'), item('a.mp3'));
    await wrapper!.vm.$nextTick();

    expect(h.onItemClick).toHaveBeenCalledWith(expect.any(MouseEvent), 'D:/music/b.mp3', 1);
    expect(wrapper!.emitted('open')).toHaveLength(1);
    expect(wrapper!.emitted('menu')).toHaveLength(1);
  });
});

describe('content interactions', () => {
  it('defaults the injected confirm dialog to approve', async () => {
    setup();
    await expect(h.showConfirm()).resolves.toBe(true);
  });

  it('forwards root events and exposes reveal', async () => {
    setup();
    const element = root();

    await element.trigger('contextmenu');
    await element.trigger('dragover');
    await element.trigger('dragleave');
    await element.trigger('drop');
    await element.trigger('mousedown');

    expect(wrapper!.emitted('menu')![0][1]).toBeNull();
    expect(h.onContentDragOver).toHaveBeenCalled();
    expect(h.onContentDragLeave).toHaveBeenCalled();
    expect(h.onContentDrop).toHaveBeenCalled();
    expect(h.onBandMouseDown).toHaveBeenCalled();
    expect(h.contentRef.value).toBe(element.element);
    expect((wrapper!.vm as unknown as { reveal: unknown }).reveal).toBe(h.reveal);
  });

  it('renders the band selection overlay', async () => {
    setup();
    h.bandSelect.value = { left: 10, top: 20, width: 100, height: 40 };
    await wrapper!.vm.$nextTick();

    const band = wrapper!.get('.fixed.pointer-events-none');
    expect(band.attributes('style')).toContain('left: 10px');
    expect(band.attributes('style')).toContain('height: 40px');
  });
});
