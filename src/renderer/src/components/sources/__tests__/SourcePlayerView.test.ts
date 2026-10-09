import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourcePlayerView from '../SourcePlayerView.vue';
import type { SourceItem } from '@renderer/types/sources';

const items: SourceItem[] = [
  { id: 'a', title: 'First', type: 'video', mediaUrl: 'https://m/a.mp4' },
  {
    id: 'b',
    title: 'Second',
    type: 'image',
    thumbnail: 'https://img/b.jpg',
    mediaUrl: 'https://m/b.jpg'
  }
];

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        sources: {
          untitled: 'Untitled',
          openInModal: 'Open in window',
          openInPreview: 'Open in preview window',
          openInBrowser: 'Open in browser',
          download: 'Download',
          downloaded: 'Downloaded',
          noItems: 'No items'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourcePlayerView, props as any) });
  app.use(i18n);
  return renderToString(app);
}

describe('SourcePlayerView', () => {
  it('selects the first item and renders its media', async () => {
    const html = await render({ items });
    expect(html).toContain('sources-player');
    // Pierwsza pozycja to wideo → element <video> w scenie.
    expect(html).toContain('<video');
    expect(html).toContain('https://m/a.mp4');
  });

  it('shows the selected item in the stage', async () => {
    const html = await render({ items });
    // Lista po prawej jest wirtualizowana, więc SSR renderuje scenę wybranej pozycji.
    expect(html).toContain('sources-player');
    expect(html).toContain('First');
  });

  it('offers a preview-window action for playable items', async () => {
    const withPlayer: SourceItem[] = [
      { id: 'p', title: 'Player', type: 'video', playerUrl: 'https://p/embed' }
    ];
    const html = await render({ items: withPlayer });
    expect(html).toContain('Open in preview window');
  });

  it('shows the download action when downloadable', async () => {
    expect(await render({ items, downloadable: false })).not.toContain('Download<');
    const html = await render({ items, downloadable: true });
    expect(html).toContain('Download');
  });
});

describe('SourcePlayerView — edge states', () => {
  it('shows the empty status and no list entries without items', async () => {
    const html = await render({ items: [] });
    expect(html).toContain('role="status"');
    expect(html).toContain('No items');
  });

  it('renders an item without an id and does not mark it downloaded', async () => {
    const html = await render({
      items: [{ title: 'No id', type: 'video', mediaUrl: 'https://m/a.mp4' }],
      downloadable: true,
      downloadedIds: new Set(['a'])
    });
    expect(html).toContain('No id');
    expect(html).not.toContain('Downloaded');
  });
});
