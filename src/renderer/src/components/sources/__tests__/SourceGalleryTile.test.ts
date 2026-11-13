import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import SourceGalleryTile from '../SourceGalleryTile.vue';
import type { SourceItem } from '@renderer/types/sources';

const item: SourceItem = {
  id: 'v1',
  title: 'Odcinek 1',
  subtitle: 'Sezon 1',
  type: 'video',
  duration: '24:00',
  thumbnail: 'https://c/1.jpg',
  mediaUrl: 'https://c/1.mp4'
};

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        sources: { untitled: 'Untitled', download: 'Download', downloaded: 'Downloaded' }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourceGalleryTile, props as never) });
  app.use(i18n);
  app.directive('activate', {});
  return renderToString(app);
}

describe('SourceGalleryTile', () => {
  it('renders an image-first tile with type, duration and title overlay', async () => {
    const html = await render({ item });
    expect(html).toContain('https://c/1.jpg');
    expect(html).toContain('video');
    expect(html).toContain('24:00');
    expect(html).toContain('Odcinek 1');
    expect(html).toContain('Sezon 1');
  });

  it('shows the download action only when downloadable and a url exists', async () => {
    expect(await render({ item, downloadable: false })).not.toContain('Download');
    expect(await render({ item, downloadable: true })).toContain('Download');
  });

  it('shows the downloaded badge instead of the download button when downloaded', async () => {
    const html = await render({ item, downloadable: true, downloaded: true });
    expect(html).toContain('Downloaded');
  });

  it('reflects the selection state in select mode', async () => {
    const html = await render({ item, selectable: true, selected: true });
    expect(html).toContain('ring-primary');
  });

  it('shows the download button disabled while downloading', async () => {
    const html = await render({ item, downloadable: true, downloading: true });
    expect(html).toContain('disabled');
  });

  it('falls back to the media URL for images without a thumbnail', async () => {
    const image: SourceItem = {
      id: 'i',
      title: 'Shot',
      type: 'image',
      mediaUrl: 'https://c/i.jpg'
    };
    const html = await render({ item: image });

    expect(html).toContain('https://c/i.jpg');
  });

  it('renders a type icon instead of an image without media', async () => {
    const file: SourceItem = { id: 'f', title: '', type: 'file' };
    const html = await render({ item: file });

    expect(html).toContain('Untitled');
    expect(html).not.toContain('<img');
  });
});

const galleryItem: SourceItem = {
  id: 'g1',
  title: 'Clip',
  subtitle: 'Live',
  type: 'video',
  duration: '1:30',
  mediaUrl: 'https://c/g.mp4'
};

function mountTile(props: Record<string, unknown>) {
  return mount(SourceGalleryTile, {
    props: { showType: true, ...props } as never,
    global: { directives: { activate: {} }, mocks: { $t: (key: string) => key } }
  });
}

describe('SourceGalleryTile interactions', () => {
  it('emits activate on click when not selecting', async () => {
    const wrapper = mountTile({ item: galleryItem });

    await wrapper.trigger('click');

    expect(wrapper.emitted('activate')?.[0]).toMatchObject([{ id: 'g1' }]);
  });

  it('emits select with the event in select mode', async () => {
    const wrapper = mountTile({ item: galleryItem, selectable: true });

    await wrapper.trigger('click');

    const emitted = wrapper.emitted('select')?.[0] as [SourceItem, MouseEvent];
    expect(emitted[0]).toMatchObject({ id: 'g1' });
    expect(emitted[1]).toBeInstanceOf(MouseEvent);
  });

  it('emits download without activating the tile', async () => {
    const wrapper = mountTile({ item: galleryItem, downloadable: true });

    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('download')?.[0]).toMatchObject([{ id: 'g1' }]);
    expect(wrapper.emitted('activate')).toBeUndefined();
  });

  it('hides the type badge when showType is false', () => {
    const shown = mountTile({ item: galleryItem });
    expect(shown.text()).toContain('video');

    const hidden = mountTile({ item: galleryItem, showType: false });
    expect(hidden.text()).not.toContain('video');
  });

  it('hides the duration badge while selecting', () => {
    expect(mountTile({ item: galleryItem }).text()).toContain('1:30');
    expect(mountTile({ item: galleryItem, selectable: true }).text()).not.toContain('1:30');
  });

  it('styles the selection checkbox for both states', () => {
    const selected = mountTile({ item: galleryItem, selectable: true, selected: true });
    const unchecked = mountTile({ item: galleryItem, selectable: true });

    expect(selected.find('span.h-5.w-5').classes()).toContain('bg-primary');
    expect(unchecked.find('span.h-5.w-5').classes()).toContain('text-transparent');
  });

  it('prefers the downloaded badge over the download button', () => {
    const wrapper = mountTile({ item: galleryItem, downloadable: true, downloaded: true });

    expect(wrapper.find('[title="sources.downloaded"]').exists()).toBe(true);
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('renders the type icon for an image without media', () => {
    const wrapper = mountTile({ item: { id: 'i', title: 'I', type: 'image' } });

    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('offers download for player URLs only', () => {
    const player = { id: 'p', title: 'P', type: 'video', playerUrl: 'https://p/embed' };
    expect(mountTile({ item: player, downloadable: true }).find('button').exists()).toBe(true);

    const noUrls = { id: 'n', title: 'N', type: 'video' };
    expect(mountTile({ item: noUrls, downloadable: true }).find('button').exists()).toBe(false);
  });
});
