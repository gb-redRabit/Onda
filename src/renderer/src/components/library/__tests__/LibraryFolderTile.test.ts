import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';

const h = vi.hoisted(() => ({
  request: vi.fn(),
  getThumb: vi.fn((path: string) => (path.includes('thumb') ? `thumb:${path}` : undefined))
}));

vi.mock('@renderer/composables/useThumbnails', () => ({
  useThumbnails: () => ({ request: h.request, getThumb: h.getThumb })
}));

const CoverStub = defineComponent({
  name: 'MediaCover',
  props: {
    path: { type: String },
    size: { type: Number },
    autoplay: { type: Boolean },
    renderAsVideo: { type: Boolean },
    still: { type: Boolean },
    fallback: { type: String }
  },
  template: '<div data-testid="cover" />'
});

import LibraryFolderTile from '../LibraryFolderTile.vue';

function track(path: string, type: string) {
  return { path, type } as never;
}

function mountTile(tracks: unknown[]) {
  return mount(LibraryFolderTile, {
    props: { tracks: tracks as never },
    global: { stubs: { MediaCover: CoverStub } }
  });
}

beforeEach(() => {
  h.request.mockClear();
  h.getThumb.mockClear();
});

describe('LibraryFolderTile', () => {
  it('renders up to four tracks and fills the rest', () => {
    const wrapper = mountTile([
      track('/a.mp3', 'audio'),
      track('/thumb-1.png', 'image'),
      track('/thumb-2.mp4', 'video'),
      track('/d.flac', 'audio'),
      track('/extra.mp3', 'audio')
    ]);

    expect(wrapper.findAll('img')).toHaveLength(2);
    expect(wrapper.findAllComponents(CoverStub)).toHaveLength(2);
    expect(wrapper.findAll('img')[0].attributes('src')).toBe('thumb:/thumb-1.png');
  });

  it('fills empty slots with folder icons', () => {
    const wrapper = mountTile([track('/a.mp3', 'audio')]);

    expect(wrapper.findAll('svg')).toHaveLength(3);
  });

  it('shows the fallback when a thumb is missing', () => {
    const wrapper = mountTile([track('/missing.png', 'image')]);

    expect(wrapper.get('img').attributes('src')).toBe('');
  });

  it('requests thumbnails for images and videos on mount', () => {
    mountTile([
      track('/thumb-1.png', 'image'),
      track('/a.mp3', 'audio'),
      track('/thumb-2.mp4', 'video')
    ]);

    expect(h.request).toHaveBeenCalledWith(['/thumb-1.png', '/thumb-2.mp4']);
  });

  it('limits the request to four visual tracks', () => {
    mountTile(
      Array.from({ length: 6 }, (_, i) => track(`/thumb-${i}.png`, i % 2 ? 'video' : 'image'))
    );

    expect(h.request).toHaveBeenCalledWith([
      '/thumb-0.png',
      '/thumb-1.png',
      '/thumb-2.png',
      '/thumb-3.png'
    ]);
  });

  it('skips the request without visual tracks', () => {
    mountTile([track('/a.mp3', 'audio'), track('/b.flac', 'audio')]);

    expect(h.request).not.toHaveBeenCalled();
  });

  it('requests again when the track list changes', async () => {
    const wrapper = mountTile([track('/a.mp3', 'audio')]);
    expect(h.request).not.toHaveBeenCalled();

    await wrapper.setProps({ tracks: [track('/thumb-new.png', 'image')] as never });
    await nextTick();

    expect(h.request).toHaveBeenCalledWith(['/thumb-new.png']);
  });
});
