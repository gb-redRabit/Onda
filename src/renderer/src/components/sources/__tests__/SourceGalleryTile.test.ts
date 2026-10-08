import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
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
});
