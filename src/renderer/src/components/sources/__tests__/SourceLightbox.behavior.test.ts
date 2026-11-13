import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const h = vi.hoisted(() => ({
  focus: vi.fn(),
  playable: vi.fn()
}));

vi.mock('@renderer/composables/useDialogFocus', () => ({
  useDialogFocus: (el: unknown, options: unknown) => h.focus(el, options)
}));
vi.mock('@renderer/utils/sourceStream', () => ({
  isSourceItemPlayable: h.playable
}));
const EmbedStub = defineComponent({
  name: 'EmbedWebview',
  props: { src: { type: String }, title: { type: String } },
  template: '<div data-testid="embed" />'
});

import SourceLightbox from '../SourceLightbox.vue';

const items = [
  { id: 'a', title: 'Alpha', type: 'image', mediaUrl: 'https://c/a.jpg', thumbnail: 'ta.jpg' },
  { id: 'b', title: 'Beta', type: 'video', mediaUrl: 'https://c/b.mp4', thumbnail: 'tb.jpg' },
  { id: 'c', title: 'Gamma', type: 'audio', mediaUrl: 'https://c/c.mp3' },
  { id: 'd', title: 'Delta', type: 'embed', playerUrl: 'https://p/d' },
  { id: 'e', title: '', type: 'other', sourceUrl: 'https://s/e' }
];

function mountLightbox(over: Record<string, unknown> = {}) {
  return mount(SourceLightbox, {
    props: { items: items as never, index: 0, ...over },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { EmbedWebview: EmbedStub, teleport: true }
    }
  });
}

beforeEach(() => {
  h.focus.mockClear();
  h.playable.mockReset().mockReturnValue(false);
});

describe('SourceLightbox behavior', () => {
  it('wires dialog focus and escape handling', () => {
    const wrapper = mountLightbox();

    expect(h.focus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ closeOnEscape: true, onEscape: expect.any(Function) })
    );
    const options = h.focus.mock.calls[0][1] as { onEscape: () => void };
    options.onEscape();
    expect(wrapper.emitted('close')).toEqual([[]]);
  });

  it('renders the counter and untitled fallback', () => {
    const wrapper = mountLightbox({ index: 4 });

    expect(wrapper.text()).toContain('5 / 5');
    expect(wrapper.text()).toContain('sources.untitled');
  });

  it('navigates cyclically with arrows and keyboard', async () => {
    const wrapper = mountLightbox({ index: 0 });

    await wrapper.get('[aria-label="common.previous"]').trigger('click');
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([4]);

    await wrapper.get('[aria-label="common.next"]').trigger('click');
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([1]);

    await wrapper.get('[data-testid="source-lightbox"]').trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([4]);

    await wrapper.get('[data-testid="source-lightbox"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:index')?.at(-1)).toEqual([1]);

    await wrapper.get('[data-testid="source-lightbox"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('update:index')).toHaveLength(4);
  });

  it('does not navigate an empty gallery', async () => {
    const wrapper = mountLightbox({ items: [], index: 0 });

    await wrapper.get('[aria-label="common.next"]').trigger('click');

    expect(wrapper.emitted('update:index')).toBeUndefined();
  });

  it('selects thumbnails', async () => {
    const wrapper = mountLightbox();
    const thumbnails = wrapper.findAll('button.w-16');

    expect(thumbnails).toHaveLength(5);
    await thumbnails[2].trigger('click');

    expect(wrapper.emitted('update:index')).toEqual([[2]]);
  });

  it('renders image, video, audio, embed and link stages', () => {
    expect(mountLightbox({ index: 0 }).find('img[src="https://c/a.jpg"]').exists()).toBe(true);
    expect(mountLightbox({ index: 1 }).find('video').exists()).toBe(true);
    expect(mountLightbox({ index: 2 }).find('audio').exists()).toBe(true);
    expect(mountLightbox({ index: 3 }).find('[data-testid="embed"]').exists()).toBe(true);

    const link = mountLightbox({ index: 4 });
    expect(link.get('a').attributes('href')).toBe('https://s/e');
    expect(link.text()).toContain('sources.openInBrowser');
  });

  it('prefers the media url over the source url', () => {
    const wrapper = mountLightbox({
      items: [{ id: 'x', title: 'X', type: 'image', mediaUrl: 'm', sourceUrl: 's' }],
      index: 0
    });

    expect(wrapper.get('img').attributes('src')).toBe('m');
  });

  it('offers play and download actions', async () => {
    h.playable.mockReturnValue(true);
    const wrapper = mountLightbox({ downloadable: true });
    const play = wrapper.get('[title="sources.playNow"]');
    const download = wrapper.get('[title="sources.download"]');

    await play.trigger('click');
    await download.trigger('click');

    expect(wrapper.emitted('play')).toEqual([[items[0]]]);
    expect(wrapper.emitted('download')).toEqual([[items[0]]]);
  });

  it('hides play for unplayable items and download for non-media', () => {
    const noMedia = mountLightbox({
      items: [{ id: 'x', title: 'X', type: 'other' }],
      index: 0,
      downloadable: true
    });

    expect(noMedia.find('[title="sources.playNow"]').exists()).toBe(false);
    expect(noMedia.find('[title="sources.download"]').exists()).toBe(false);
  });

  it('disables download for downloaded or active downloads', () => {
    h.playable.mockReturnValue(true);
    const wrapper = mountLightbox({
      downloadable: true,
      downloadedIds: new Set(['a']),
      downloadingItem: items[0]
    });
    const download = wrapper.get('[title="sources.downloaded"]');

    expect(download.attributes('disabled')).toBe('');
    expect(download.classes()).toContain('text-success');
  });

  it('handles items without ids or media urls', () => {
    const noUrl = mountLightbox({
      items: [{ title: 'No url', type: 'image' }],
      index: 0
    });

    expect(noUrl.find('img').exists()).toBe(false);
    expect(noUrl.get('a').attributes('href')).toBe('');

    const idless = mountLightbox({
      items: [{ title: 'No id', type: 'image', mediaUrl: 'm' }],
      index: 0
    });
    expect(idless.findAll('button.w-16')).toHaveLength(1);
  });

  it('closes from the close button', async () => {
    const wrapper = mountLightbox();

    await wrapper.get('[aria-label="common.close"]').trigger('click');

    expect(wrapper.emitted('close')).toEqual([[]]);
  });
});
