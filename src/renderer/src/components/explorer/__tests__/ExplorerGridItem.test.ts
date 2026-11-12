import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref } from 'vue';

const h = vi.hoisted(() => ({
  selected: new Set<string>(),
  rootEl: null as any,
  systemIcon: null as any,
  mediaThumb: null as any,
  beginFileDrag: vi.fn(),
  formatFileSize: vi.fn((size: number) => `${size} B`)
}));

vi.mock('@renderer/stores/explorer', () => ({
  useExplorerStore: () => ({ selectedFiles: h.selected })
}));
vi.mock('@renderer/composables/useThumbnail', () => ({
  useThumbnail: () => ({
    rootEl: h.rootEl,
    systemIcon: h.systemIcon,
    mediaThumb: h.mediaThumb
  })
}));
vi.mock('@renderer/utils/fileTypes', () => ({
  getFileTypeInfo: (extension: string) => ({
    category: extension === 'mp3' ? 'audio' : 'other',
    color: '#ff0000'
  })
}));
vi.mock('@renderer/utils/fileTypeIcons', () => ({
  fileTypeIcon: () => ({ template: '<i data-testid="type-icon" />' })
}));
vi.mock('@renderer/utils/formatters', () => ({ formatFileSize: h.formatFileSize }));
vi.mock('@renderer/utils/fileDrag', () => ({ beginFileDrag: h.beginFileDrag }));

import ExplorerGridItem from '../ExplorerGridItem.vue';
import type { FileItem } from '@renderer/types/explorer';

let wrapper: VueWrapper | null = null;

function item(overrides: Partial<FileItem> = {}): FileItem {
  return {
    name: 'file.mp3',
    path: 'D:\\Music\\file.mp3',
    isDirectory: false,
    size: 2048,
    modifiedAt: 0,
    createdAt: 0,
    extension: 'mp3',
    ...overrides
  };
}

function mountItem(props: Record<string, unknown> = {}) {
  wrapper = mount(ExplorerGridItem, {
    props: { item: item(), isSelected: false, isDriveList: false, ...props },
    attachTo: document.body
  });
  return wrapper;
}

function root() {
  return wrapper!.get('[data-file-path]');
}

function iconBox(): HTMLElement {
  return root().element.firstElementChild as HTMLElement;
}

beforeEach(() => {
  h.selected = new Set<string>();
  h.rootEl = ref(null);
  h.systemIcon = ref<string | null>(null);
  h.mediaThumb = ref<string | null>(null);
  h.beginFileDrag.mockClear();
  h.formatFileSize.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('sizing', () => {
  it.each([
    [undefined, '48px'],
    ['small', '36px'],
    ['medium', '48px'],
    ['large', '64px'],
    ['extraLarge', '80px']
  ])('uses the %s icon size', (viewMode, expected) => {
    mountItem({ viewMode });

    expect(iconBox().style.width).toBe(expected);
    expect(iconBox().style.height).toBe(expected);
  });
});

describe('icons', () => {
  it('shows a hard drive for the drive list without drag', () => {
    mountItem({ isDriveList: true });

    expect(root().attributes('draggable')).toBe('false');
    expect(wrapper!.html()).toContain('lucide-hard-drive');
    expect(wrapper!.text()).toContain('2048 B');
  });

  it('shows a folder and exposes its path', () => {
    mountItem({ item: item({ isDirectory: true, extension: undefined }) });

    expect(root().attributes('data-folder-path')).toBe('D:\\Music\\file.mp3');
    expect(wrapper!.html()).toContain('lucide-folder-open');
  });

  it('prefers a media thumbnail', () => {
    h.mediaThumb.value = 'blob:thumb';

    mountItem();

    const img = root().find('img');
    expect(img.attributes('src')).toBe('blob:thumb');
    expect(img.classes()).toContain('object-cover');
  });

  it('shows a music note for audio files without a system icon', () => {
    mountItem();

    expect(wrapper!.html()).toContain('lucide-music');
    expect(root().find('img').exists()).toBe(false);
  });

  it('shows the system icon at half size', () => {
    h.systemIcon.value = 'file://icon.png';

    mountItem();

    const img = root().find('img');
    expect(img.attributes('src')).toBe('file://icon.png');
    expect(img.attributes('style')).toContain('24px');
  });

  it('falls back to the category icon with its colour', () => {
    mountItem({ item: item({ extension: 'pdf' }) });

    expect(wrapper!.find('[data-testid="type-icon"]').exists()).toBe(true);
  });

  it('shows the extension badge only for files with an extension', () => {
    mountItem();
    expect(wrapper!.html()).toContain('text-4xs font-semibold');

    wrapper!.unmount();
    mountItem({ item: item({ extension: undefined }) });
    expect(wrapper!.html()).not.toContain('text-4xs font-semibold');
  });
});

describe('state classes', () => {
  it('highlights selected items and dims cut items', () => {
    mountItem({ isSelected: true, isCut: true });

    expect(root().classes()).toContain('bg-primary/12');
    expect(root().classes()).toContain('opacity-40');
  });

  it('highlights a folder being hovered as a drop target', () => {
    mountItem({
      item: item({ isDirectory: true }),
      hoveredFolderPath: 'D:\\Music\\file.mp3'
    });

    expect(root().classes()).toContain('ring-2');
  });

  it('marks library folders and uses the library background', () => {
    mountItem({ isLibraryFolder: true, item: item({ isDirectory: true }) });

    expect(wrapper!.text()).toContain('LIB');
    expect(iconBox().className).toContain('bg-primary/10');
  });
});

describe('interactions', () => {
  it('emits select, doubleClick and contextMenu', async () => {
    mountItem();

    await root().trigger('click');
    await root().trigger('dblclick');
    await root().trigger('contextmenu');

    expect(wrapper!.emitted('select')![0][0]).toBe('D:\\Music\\file.mp3');
    expect(wrapper!.emitted('doubleClick')![0][0]).toMatchObject({ name: 'file.mp3' });
    expect(wrapper!.emitted('contextMenu')).toHaveLength(1);
  });

  it('drags only the pressed file when it is not selected', () => {
    mountItem();
    const event = new Event('dragstart', { bubbles: true });

    root().element.dispatchEvent(event);

    expect(h.beginFileDrag).toHaveBeenCalledWith(event, ['D:\\Music\\file.mp3']);
  });

  it('drags the whole selection when the pressed file is selected', () => {
    h.selected = new Set(['D:\\Music\\file.mp3', 'D:\\Music\\other.mp3']);
    mountItem();
    const event = new Event('dragstart', { bubbles: true });

    root().element.dispatchEvent(event);

    expect(h.beginFileDrag).toHaveBeenCalledWith(event, [
      'D:\\Music\\file.mp3',
      'D:\\Music\\other.mp3'
    ]);
  });
});
