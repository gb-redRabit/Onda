import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SourcePlayerView from '../SourcePlayerView.vue';
import type { SourceItem } from '@renderer/types/sources';

// Interactions in the source "player" view: scene media, list selection, bulk
// selection and download states.

const global = {
  mocks: { $t: (key: string) => key },
  stubs: {
    EmbedWebview: { props: ['src', 'title'], template: '<div data-testid="embed" />' }
  }
};

function item(over: Partial<SourceItem> = {}): SourceItem {
  return { id: 'a', title: 'First', type: 'video', ...over } as SourceItem;
}

function mountView(props: Record<string, unknown>) {
  return mount(SourcePlayerView, { props: props as never, global });
}

describe('SourcePlayerView scene', () => {
  it('renders image, audio and video media', async () => {
    expect(
      mountView({ items: [item({ type: 'image', mediaUrl: 'https://m/a.jpg' })] })
        .find('img')
        .exists()
    ).toBe(true);
    expect(
      mountView({ items: [item({ type: 'audio', mediaUrl: 'https://m/a.mp3' })] })
        .find('audio')
        .attributes('src')
    ).toBe('https://m/a.mp3');
    expect(
      mountView({ items: [item({ mediaUrl: 'https://m/a.mp4' })] })
        .find('video')
        .attributes('src')
    ).toBe('https://m/a.mp4');
  });

  it('embeds a player URL before falling back to links', () => {
    const embed = mountView({
      items: [item({ type: 'file', playerUrl: 'https://p/embed' })]
    });
    expect(embed.find('[data-testid="embed"]').exists()).toBe(true);

    const link = mountView({
      items: [item({ type: 'file', sourceUrl: 'https://site/watch' })]
    });
    expect(link.find('a[href="https://site/watch"]').exists()).toBe(true);

    const mediaLink = mountView({
      items: [item({ type: 'file', mediaUrl: 'https://m/direct.bin' })]
    });
    expect(mediaLink.find('a[href="https://m/direct.bin"]').exists()).toBe(true);
  });

  it('shows metadata, subtitles and the untitled fallback', () => {
    const wrapper = mountView({
      items: [item({ title: '', subtitle: 'S1', mediaUrl: 'https://m/a.mp4' })]
    });
    expect(wrapper.text()).toContain('sources.untitled');
    expect(wrapper.text()).toContain('S1');
  });

  it('prefers sourceUrl in mediaUrl fallback', () => {
    const wrapper = mountView({
      items: [item({ type: 'image', sourceUrl: 'https://m/from-source.jpg' })]
    });
    expect(wrapper.find('img').attributes('src')).toBe('https://m/from-source.jpg');
  });

  it('renders an empty browser link when no URL is available', () => {
    const wrapper = mountView({ items: [item({ type: 'file' })] });

    expect(wrapper.find('a').attributes('href')).toBe('');
  });
});

describe('SourcePlayerView list', () => {
  const items = [
    item({ id: 'a', type: 'video', mediaUrl: 'https://m/a.mp4', thumbnail: 'https://t/a.jpg' }),
    item({ id: 'b', title: 'Second', type: 'audio', mediaUrl: 'https://m/b.mp3' })
  ];

  it('selects an item from the list and updates the scene', async () => {
    const wrapper = mountView({ items });
    const buttons = wrapper.findAll('aside button');
    expect(buttons).toHaveLength(2);

    await buttons[1]!.trigger('click');
    await nextTick();

    expect(wrapper.find('audio').attributes('src')).toBe('https://m/b.mp3');
  });

  it('keeps the selection when the same object remains after an items update', async () => {
    const wrapper = mountView({ items });
    await wrapper.findAll('aside button')[1]!.trigger('click');

    await wrapper.setProps({ items: [...items] });
    await nextTick();

    expect(wrapper.find('audio').exists()).toBe(true);
  });

  it('resets to the first item when the selection disappears', async () => {
    const wrapper = mountView({ items });
    await wrapper.findAll('aside button')[1]!.trigger('click');

    await wrapper.setProps({ items: [items[0]!] });
    await nextTick();

    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('renders list thumbnails, icons and the downloaded marker', () => {
    const wrapper = mountView({ items, downloadedIds: new Set(['a', 'b']) });

    expect(wrapper.find('aside img').attributes('src')).toBe('https://t/a.jpg');
    expect(wrapper.findAll('aside svg').length).toBeGreaterThan(0);
    expect(wrapper.findAll('aside .text-success')).toHaveLength(2);
  });

  it('emits select instead of switching the scene in select mode', async () => {
    const wrapper = mountView({ items, selectable: true, selectedIds: new Set(['a']) });
    const buttons = wrapper.findAll('aside button');

    expect(buttons[0]!.classes()).toContain('ring-primary');
    await buttons[1]!.trigger('click');

    const emitted = wrapper.emitted('select')?.[0] as [SourceItem, MouseEvent];
    expect(emitted[0]).toMatchObject({ id: 'b' });
    expect(emitted[1]).toBeInstanceOf(MouseEvent);
    expect(wrapper.find('video').exists()).toBe(true);
  });

  it('styles unchecked rows when only some items are selected', () => {
    const wrapper = mountView({ items, selectable: true, selectedIds: new Set() });

    expect(wrapper.find('aside span.w-5.h-5').classes()).toContain('text-transparent');
  });
});

describe('SourcePlayerView actions', () => {
  const video = item({ mediaUrl: 'https://m/a.mp4' });

  it('opens the modal for the current item', async () => {
    const wrapper = mountView({ items: [video] });

    await wrapper.find('button[title="sources.openInModal"]').trigger('click');

    expect(wrapper.emitted('activate')?.[0]).toMatchObject([{ id: 'a' }]);
  });

  it('marks downloaded items and disables their download button', () => {
    const wrapper = mountView({
      items: [video],
      downloadable: true,
      downloadedIds: new Set(['a'])
    });
    const download = wrapper
      .findAll('button')
      .find((b) => b.text().includes('sources.downloaded'))!;

    expect(download.attributes('disabled')).toBe('');
    expect(download.classes()).toContain('bg-success');
  });

  it('disables the download button while the item is downloading', () => {
    const wrapper = mountView({ items: [video], downloadable: true, downloadingItem: video });

    const download = wrapper.findAll('button').find((b) => b.text().includes('sources.download'))!;
    expect(download.attributes('disabled')).toBe('');
  });

  it('offers download for player URLs and emits normal downloads', async () => {
    const playerItem = item({ id: 'p', type: 'video', playerUrl: 'https://p/embed' });
    const wrapper = mountView({ items: [playerItem], downloadable: true });
    const download = wrapper.findAll('button').find((b) => b.text().includes('sources.download'))!;

    await download.trigger('click');

    expect(wrapper.emitted('download')?.[0]).toMatchObject([{ id: 'p' }]);
  });

  it('hides the download button without downloadable URLs', () => {
    const wrapper = mountView({
      items: [item({ type: 'file', sourceUrl: 'https://site/watch' })],
      downloadable: true
    });

    expect(wrapper.findAll('button').some((b) => b.text().includes('sources.download'))).toBe(
      false
    );
  });
});
