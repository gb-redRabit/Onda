import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const state = vi.hoisted(() => ({
  showImageMenu: vi.fn()
}));

vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showImageMenu: state.showImageMenu })
}));

import DirChildFiles from '../DirChildFiles.vue';

const RowStub = defineComponent({
  name: 'LibraryTrackRow',
  props: { track: { type: Object }, showPlaylist: { type: Boolean } },
  emits: ['edit'],
  template: '<div data-testid="row" @click="$emit(\'edit\', track)" />'
});

type Meta = {
  directAll: unknown[];
  directImages: { path: string }[];
  directAudio: { path: string }[];
};

function meta(over: Partial<Meta> = {}): Meta {
  return { directAll: [], directImages: [], directAudio: [], ...over };
}

function mountFiles(metaValue: Meta, thumbs: Record<string, string> = {}) {
  return mount(DirChildFiles, {
    props: {
      meta: metaValue as never,
      childName: 'Child',
      getThumb: (path: string) => thumbs[path]
    },
    global: {
      mocks: { $t: (key: string, params?: object) => `${key}:${JSON.stringify(params ?? {})}` },
      stubs: { LibraryTrackRow: RowStub }
    }
  });
}

beforeEach(() => {
  state.showImageMenu.mockClear();
});

describe('DirChildFiles', () => {
  it('renders nothing when the folder has no direct files', () => {
    expect(mountFiles(meta()).html()).toBe('<!--v-if-->');
  });

  it('renders up to twenty-four images with thumbnails', async () => {
    const images = Array.from({ length: 30 }, (_, i) => ({ path: `/img/${i}.png` }));
    const wrapper = mountFiles(meta({ directAll: images, directImages: images }), {
      '/img/0.png': 'thumb-0'
    });
    const buttons = wrapper.findAll('button');

    expect(buttons).toHaveLength(24);
    expect(wrapper.find('img').attributes('src')).toBe('thumb-0');

    await buttons[0].trigger('click');
    expect(wrapper.emitted('open-image')).toEqual([['Child', '/img/0.png']]);

    await buttons[1].trigger('contextmenu');
    expect(state.showImageMenu).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      images[1],
      expect.any(Function)
    );
    expect((state.showImageMenu.mock.calls[0][0] as MouseEvent).type).toBe('contextmenu');

    const callback = state.showImageMenu.mock.calls[0][2] as () => void;
    callback();
    expect(wrapper.emitted('open-image')?.at(-1)).toEqual(['Child', '/img/1.png']);
  });

  it('falls back to an empty thumbnail url', () => {
    const wrapper = mountFiles(meta({ directAll: [{}], directImages: [{ path: '/x.png' }] }));

    expect(wrapper.find('img').attributes('src')).toBe('');
  });

  it('renders up to fifty audio rows and forwards edits', async () => {
    const audio = Array.from({ length: 60 }, (_, i) => ({ path: `/a/${i}.mp3` }));
    const wrapper = mountFiles(meta({ directAll: audio, directAudio: audio }));
    const rows = wrapper.findAll('[data-testid="row"]');

    expect(rows).toHaveLength(50);
    await rows[0].trigger('click');
    expect(wrapper.emitted('edit')).toEqual([[audio[0]]]);
  });

  it('shows a truncation notice beyond fifty tracks', async () => {
    const audio = Array.from({ length: 55 }, (_, i) => ({ path: `/a/${i}.mp3` }));
    const wrapper = mountFiles(meta({ directAll: audio, directAudio: audio }));
    const notice = wrapper.findAll('button').at(-1)!;

    expect(notice.text()).toContain('library.listTruncated');
    expect(notice.text()).toContain('"shown":50');
    expect(notice.text()).toContain('"total":55');

    await notice.trigger('click');
    expect(wrapper.emitted('open-image')).toBeUndefined();
  });

  it('hides the truncation notice at exactly fifty tracks', () => {
    const audio = Array.from({ length: 50 }, (_, i) => ({ path: `/a/${i}.mp3` }));
    const wrapper = mountFiles(meta({ directAll: audio, directAudio: audio }));

    expect(wrapper.text()).not.toContain('library.listTruncated');
  });
});
