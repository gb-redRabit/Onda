import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';

const h = vi.hoisted(() => ({
  store: { selectedFiles: new Set<string>() },
  beginFileDrag: vi.fn(),
  fileTypeIcon: vi.fn((): unknown => null),
  thumb: { rootEl: null as any, systemIcon: null as any, mediaThumb: null as any }
}));

vi.mock('@renderer/stores/explorer', () => ({ useExplorerStore: () => h.store }));
vi.mock('@renderer/utils/fileDrag', () => ({ beginFileDrag: h.beginFileDrag }));
vi.mock('@renderer/utils/fileTypeIcons', () => ({ fileTypeIcon: h.fileTypeIcon }));
vi.mock('@renderer/utils/formatters', () => ({ formatFileSize: (n: number) => `${n}B` }));
vi.mock('@renderer/composables/useThumbnail', () => ({
  useThumbnail: (path: () => string, isDirectory: () => boolean, isDriveList: () => boolean) => {
    void path();
    void isDirectory();
    void isDriveList();
    return h.thumb;
  }
}));

import ExplorerTableRow from '../ExplorerTableRow.vue';

const Icon: unknown = defineComponent({
  name: 'TypeIcon',
  template: '<svg data-testid="type-icon" />'
});

const item = {
  path: 'D:/a.mp3',
  name: 'a.mp3',
  isDirectory: false,
  size: 2048,
  extension: 'mp3',
  modifiedAt: Date.UTC(2026, 0, 2)
};

function mountRow(over: Record<string, unknown> = {}) {
  return mount(ExplorerTableRow, {
    props: { item: item as never, isSelected: false, isDriveList: false, ...over },
    global: { mocks: { $t: (key: string) => key } }
  });
}

beforeEach(() => {
  h.store.selectedFiles = new Set<string>();
  h.beginFileDrag.mockClear();
  h.fileTypeIcon.mockClear().mockReturnValue(Icon);
  h.thumb = {
    rootEl: ref(null),
    systemIcon: ref(undefined),
    mediaThumb: ref(undefined)
  };
});

describe('ExplorerTableRow', () => {
  it('renders the row data', () => {
    const wrapper = mountRow();
    const text = wrapper.text();

    expect(wrapper.find('[data-testid="explorer-item-a.mp3"]').exists()).toBe(true);
    expect(text).toContain('a.mp3');
    expect(text).toContain('2048B');
    expect(text).toContain('mp3');
    expect(text).toContain(new Date(item.modifiedAt).toLocaleDateString());
    expect(wrapper.find('[data-testid="type-icon"]').exists()).toBe(true);
  });

  it('emits select, double click and context menu', async () => {
    const wrapper = mountRow();
    const button = wrapper.get('[data-testid="explorer-item-a.mp3"]');

    await button.trigger('click');
    await button.trigger('dblclick');
    await button.trigger('contextmenu');

    const selected = wrapper.emitted('select')!;
    expect(selected[0][0]).toBe('D:/a.mp3');
    expect(selected[0][1]).toBeInstanceOf(MouseEvent);
    expect(wrapper.emitted('doubleClick')).toEqual([[item]]);
    const menu = wrapper.emitted('contextMenu')!;
    expect(menu[0][0]).toBeInstanceOf(MouseEvent);
    expect(menu[0][1]).toMatchObject({ path: 'D:/a.mp3' });
  });

  it('highlights selected rows and cuts', () => {
    const selected = mountRow({ isSelected: true });
    expect(selected.classes()).toContain('bg-primary/12');

    const cut = mountRow({ isCut: true });
    expect(cut.classes()).toContain('opacity-40');
  });

  it('highlights a hovered destination folder', () => {
    const folder = { ...item, path: 'D:/folder', name: 'folder', isDirectory: true };
    const wrapper = mountRow({
      item: folder,
      hoveredFolderPath: 'D:/folder'
    });

    expect(wrapper.classes()).toContain('bg-primary/12');
  });

  it('marks directories and drive lists as folders', () => {
    const folder = mountRow({
      item: { ...item, isDirectory: true, path: 'D:/folder', name: 'folder' }
    });
    expect(folder.find('[data-folder-path]').attributes('data-folder-path')).toBe('D:/folder');
    expect(folder.text()).toContain('—');

    const drive = mountRow({ isDriveList: true, item: { ...item, extension: '' } });
    expect(drive.attributes('draggable')).toBe('false');
    expect(drive.text()).toContain('explorer.drive');

    const emptyDrive = mountRow({ isDriveList: true, item: { ...item, size: 0, extension: '' } });
    expect(emptyDrive.text()).toContain('—');

    const noExtension = mountRow({ item: { ...item, extension: '' } });
    expect(noExtension.text()).toContain('—');
  });

  it('prefers media and system thumbnails', () => {
    h.thumb.mediaThumb.value = 'blob:media';
    const media = mountRow();
    expect(media.get('img').attributes('src')).toBe('blob:media');

    h.thumb = { rootEl: ref(null), systemIcon: ref('icon:file'), mediaThumb: ref(undefined) };
    const system = mountRow();
    expect(system.get('img').attributes('src')).toBe('icon:file');
  });

  it('keeps the thumbnail root ref in dev builds', () => {
    vi.stubEnv('DEV', true);
    try {
      expect(mountRow().exists()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('drags the whole selection when the row is selected', async () => {
    h.store.selectedFiles = new Set(['D:/a.mp3', 'D:/b.mp3']);
    const wrapper = mountRow();

    await wrapper.get('[data-testid="explorer-item-a.mp3"]').trigger('dragstart', {
      dataTransfer: {}
    });

    expect(h.beginFileDrag).toHaveBeenCalledWith(expect.anything(), ['D:/a.mp3', 'D:/b.mp3']);
  });

  it('drags only the row when it is not selected', async () => {
    const wrapper = mountRow();

    await wrapper.get('[data-testid="explorer-item-a.mp3"]').trigger('dragstart', {
      dataTransfer: {}
    });

    expect(h.beginFileDrag).toHaveBeenCalledWith(expect.anything(), ['D:/a.mp3']);
  });
});
