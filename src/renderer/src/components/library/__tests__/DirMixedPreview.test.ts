import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  showImageMenu: vi.fn(),
  showTrackMenu: vi.fn(),
  pluralCategory: vi.fn(() => 'many'),
  t: vi.fn((key: string, params?: { count: number }) => (params ? `${key}:${params.count}` : key))
}));

vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showImageMenu: h.showImageMenu, showTrackMenu: h.showTrackMenu })
}));
vi.mock('@renderer/utils/plural', () => ({ pluralCategory: h.pluralCategory }));
vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: h.t, locale: { value: 'pl' } }) };
});

const TileStub = defineComponent({
  name: 'LibraryFolderTile',
  props: { tracks: { type: Array } },
  template: '<div data-testid="tile" />'
});
const CoverStub = defineComponent({
  name: 'MediaCover',
  props: { path: { type: String }, size: { type: Number } },
  template: '<div data-testid="cover" />'
});

import DirMixedPreview from '../DirMixedPreview.vue';

const folders = ['Alpha', 'Beta', 'Orphan'];
const files = [
  {
    path: '/Music/a.mp3',
    name: 'a.mp3',
    type: 'audio',
    metadata: { title: 'Song', artist: 'Artist' }
  },
  { path: '/Music/img.png', name: 'img.png', type: 'image', extension: 'png' },
  { path: '/Music/clip.mp4', name: 'clip.mp4', type: 'video', metadata: { title: 'Clip' } }
];

const meta = {
  Alpha: { audio: [{ path: '/a1.mp3' }], audioCount: 3 },
  Beta: { audio: [], audioCount: 1 }
};

function mountPreview() {
  return mount(DirMixedPreview, {
    props: {
      folders,
      files: files as never,
      meta: meta as never,
      getThumb: (path: string) => (path.includes('img') ? 'thumb:img' : undefined)
    },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { LibraryFolderTile: TileStub, MediaCover: CoverStub }
    }
  });
}

beforeEach(() => {
  h.showImageMenu.mockClear();
  h.showTrackMenu.mockClear();
  h.pluralCategory.mockReset().mockReturnValue('many');
  h.t.mockClear();
});

describe('DirMixedPreview', () => {
  it('renders folders with tracks and pluralized counts', () => {
    const wrapper = mountPreview();
    const text = wrapper.text();

    expect(wrapper.findAll('[data-testid="tile"]')).toHaveLength(3);
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('library.fileCountMany:3');
    expect(text).toContain('library.fileCountMany:1');
    expect(h.t).toHaveBeenCalledWith('library.fileCountMany', { count: 3 });
  });

  it('uses singular and few plural forms', () => {
    h.pluralCategory.mockReturnValue('one');
    mountPreview();
    expect(h.t).toHaveBeenCalledWith('library.fileCountOne', { count: 3 });

    h.pluralCategory.mockReturnValue('few');
    mountPreview();
    expect(h.t).toHaveBeenCalledWith('library.fileCountFew', { count: 3 });
  });

  it('toggles a folder', async () => {
    const wrapper = mountPreview();

    await wrapper.findAll('button')[0].trigger('click');

    expect(wrapper.emitted('toggle')).toEqual([['Alpha']]);
  });

  it('renders file covers with titles and metadata', () => {
    const wrapper = mountPreview();
    const text = wrapper.text();

    expect(text).toContain('Song');
    expect(text).toContain('Artist');
    expect(text).toContain('Clip');
    expect(text).toContain('png');
    expect(wrapper.get('img').attributes('src')).toBe('thumb:img');
    expect(wrapper.findAll('[data-testid="cover"]')).toHaveLength(1);
  });

  it('opens images and plays audio from previews', async () => {
    const wrapper = mountPreview();
    const buttons = wrapper.findAll('button');

    await buttons[3].trigger('click');
    await buttons[4].trigger('click');

    expect(wrapper.emitted('play')).toEqual([['/Music/a.mp3']]);
    expect(wrapper.emitted('open-image')).toEqual([['/Music/img.png']]);
  });

  it('handles folders without metadata', () => {
    const wrapper = mountPreview();
    const text = wrapper.text();

    expect(text).toContain('Orphan');
    expect(text).toContain('library.fileCountMany:0');
  });

  it('opens images on double click', async () => {
    const wrapper = mountPreview();

    await wrapper.findAll('button')[4].trigger('dblclick');

    expect(wrapper.emitted('open-image')).toEqual([['/Music/img.png']]);
  });

  it('plays from a double click on audio', async () => {
    const wrapper = mountPreview();

    await wrapper.findAll('button')[3].trigger('dblclick');

    expect(wrapper.emitted('play')).toEqual([['/Music/a.mp3']]);
  });

  it('shows an image context menu', async () => {
    const wrapper = mountPreview();

    await wrapper.findAll('button')[4].trigger('contextmenu');

    expect(h.showImageMenu).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      files[1],
      expect.any(Function)
    );
    const callback = h.showImageMenu.mock.calls[0][2] as () => void;
    callback();
    expect(wrapper.emitted('open-image')?.at(-1)).toEqual(['/Music/img.png']);
  });

  it('shows a track context menu and forwards edits', async () => {
    const wrapper = mountPreview();

    await wrapper.findAll('button')[3].trigger('contextmenu');

    expect(h.showTrackMenu).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      files[0],
      expect.objectContaining({ onEdit: expect.any(Function) })
    );
    const options = h.showTrackMenu.mock.calls[0][2] as { onEdit: () => void };
    options.onEdit();
    expect(wrapper.emitted('edit')?.at(-1)).toEqual([files[0]]);
  });
});
