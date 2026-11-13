import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const state = vi.hoisted(() => ({
  showImageMenu: vi.fn(),
  t: vi.fn((key: string, params?: object) => `${key}:${JSON.stringify(params ?? {})}`)
}));

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: state.t }) };
});
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showImageMenu: state.showImageMenu })
}));

import DirDirectFiles from '../DirDirectFiles.vue';

const RowStub = defineComponent({
  name: 'LibraryTrackRow',
  props: { track: { type: Object }, showPlaylist: { type: Boolean } },
  emits: ['edit'],
  template: '<div data-testid="row" @click="$emit(\'edit\', track)" />'
});

type File = { path: string; name?: string };

function files(count: number, prefix: string): File[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `/${prefix}/${i}`,
    name: `${prefix}${i}`
  }));
}

function mountFiles(
  over: Partial<{ audio: File[]; images: File[]; audioLimit: number; imageLimit: number }> = {},
  thumbs: Record<string, string> = {}
) {
  return mount(DirDirectFiles, {
    props: {
      audio: (over.audio ?? []) as never,
      images: (over.images ?? []) as never,
      audioLimit: over.audioLimit ?? 10,
      imageLimit: over.imageLimit ?? 4,
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
  state.t.mockClear();
});

describe('DirDirectFiles', () => {
  it('renders nothing without files', () => {
    const wrapper = mountFiles();

    expect(wrapper.findAll('[data-testid="row"]')).toHaveLength(0);
    expect(wrapper.findAll('img')).toHaveLength(0);
  });

  it('renders audio up to the limit and forwards edits', async () => {
    const audio = files(12, 'a');
    const wrapper = mountFiles({ audio, audioLimit: 5 });
    const rows = wrapper.findAll('[data-testid="row"]');

    expect(rows).toHaveLength(5);
    await rows[0].trigger('click');
    expect(wrapper.emitted('edit')).toEqual([[audio[0]]]);
  });

  it('offers more audio with the remaining count', async () => {
    const wrapper = mountFiles({ audio: files(12, 'a'), audioLimit: 5 });
    const more = wrapper.findAll('button').at(-1)!;

    expect(more.text()).toContain('library.showMoreAudio');
    expect(more.text()).toContain('"remaining":7');
    expect(more.text()).toContain('"total":12');

    await more.trigger('click');
    expect(wrapper.emitted('more-audio')).toEqual([[]]);
  });

  it('hides the more-audio button at the limit', () => {
    const wrapper = mountFiles({ audio: files(5, 'a'), audioLimit: 5 });

    expect(wrapper.text()).not.toContain('library.showMoreAudio');
  });

  it('renders images up to the limit with thumbnails and alt text', async () => {
    const images = files(6, 'img');
    const wrapper = mountFiles({ images, imageLimit: 4 }, { '/img/0': 'thumb-0' });
    const buttons = wrapper.findAll('button');
    const img = wrapper.find('img');

    expect(buttons).toHaveLength(5);
    expect(img.attributes('src')).toBe('thumb-0');
    expect(img.attributes('alt')).toBe('img0');

    await buttons[0].trigger('click');
    expect(wrapper.emitted('open-image')).toEqual([['/img/0']]);

    await buttons[1].trigger('contextmenu');
    expect(state.showImageMenu).toHaveBeenCalledWith(
      expect.any(MouseEvent),
      images[1],
      expect.any(Function)
    );
    const callback = state.showImageMenu.mock.calls[0][2] as () => void;
    callback();
    expect(wrapper.emitted('open-image')?.at(-1)).toEqual(['/img/1']);
  });

  it('offers more images with the remaining count', async () => {
    const wrapper = mountFiles({ images: files(6, 'img'), imageLimit: 4 });
    const more = wrapper.findAll('button').at(-1)!;

    expect(more.text()).toContain('library.showMoreImages');
    expect(more.text()).toContain('"remaining":2');

    await more.trigger('click');
    expect(wrapper.emitted('more-images')).toEqual([[]]);
  });

  it('falls back to an empty thumbnail url', () => {
    const wrapper = mountFiles({ images: files(1, 'img') });

    expect(wrapper.find('img').attributes('src')).toBe('');
  });
});
