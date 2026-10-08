import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourcePageView from '../SourcePageView.vue';
import type { SourceItem } from '@renderer/types/sources';

const page: SourceItem = {
  id: 'p',
  title: 'Series',
  subtitle: 'Sub',
  type: 'video',
  thumbnail: 'https://covers/p.jpg'
};

const rows: SourceItem[] = [
  { id: 'r1', title: 'Odcinek 1', type: 'video', thumbnail: 'https://covers/1.jpg' },
  { id: 'r2', title: 'Odcinek 2', type: 'video' }
];

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        sources: {
          untitled: 'Untitled',
          episodes: 'Episodes',
          download: 'Download',
          downloaded: 'Downloaded',
          downloadAllRows: 'Download all episodes',
          noTableRows: 'No rows',
          openInBrowser: 'Open in browser',
          openInModal: 'Open in window',
          openInPreview: 'Open in preview window',
          noItems: 'No items'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourcePageView, props as any) });
  app.use(i18n);
  app.directive('activate', {});
  return renderToString(app);
}

describe('SourcePageView', () => {
  it('renders the page hero and the episode rows', async () => {
    const html = await render({ item: page, rows });
    expect(html).toContain('Series');
    expect(html).toContain('Sub');
    expect(html).toContain('Episodes');
    expect(html).toContain('Odcinek 1');
    expect(html).toContain('Odcinek 2');
  });

  it('renders the carousel when viewMode is carousel', async () => {
    const html = await render({
      item: page,
      rows,
      viewMode: 'carousel'
    });
    expect(html).toContain('sources-carousel');
  });

  it('renders the compact list when viewMode is compact', async () => {
    const html = await render({ item: page, rows, viewMode: 'compact' });
    expect(html).toContain('sources-compact');
  });

  it('renders gallery tiles and marks the selected ones in select mode', async () => {
    const html = await render({
      item: page,
      rows,
      viewMode: 'gallery',
      selectable: true,
      selectedIds: new Set(['r1'])
    });
    expect(html).toContain('source-gallery-tile');
    expect(html).toContain('ring-primary');
  });

  it('shows the download-all-rows action only when downloadable', async () => {
    expect(await render({ item: page, rows, downloadable: false })).not.toContain(
      'Download all episodes'
    );
    expect(await render({ item: page, rows, downloadable: true })).toContain(
      'Download all episodes'
    );
  });
});
