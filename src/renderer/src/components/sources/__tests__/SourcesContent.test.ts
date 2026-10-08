import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourcesContent from '../SourcesContent.vue';
import type { SourceItem } from '@renderer/types/sources';

const page: SourceItem = { id: 'p', title: 'Series', type: 'video' };
const row: SourceItem = { id: 'r', title: 'Odcinek 1', type: 'video' };

function i18n() {
  return createI18n({
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
          noItems: 'No items',
          refresh: 'Refresh',
          loadMore: 'Load more',
          editSourceShortcut: 'Edit source'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
}

function props(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    error: '',
    isAuthError: false,
    isPage: false,
    viewMode: 'cards',
    pageItem: undefined,
    rows: [],
    rowLoading: false,
    rowClickable: false,
    downloadable: false,
    items: [],
    displayItems: [],
    loading: false,
    filterText: '',
    hasMore: false,
    paginationMode: 'none',
    downloadingItem: null,
    downloadedIds: new Set<string>(),
    ...over
  };
}

async function render(over: Record<string, unknown> = {}): Promise<string> {
  const app = createSSRApp({ render: () => h(SourcesContent, props(over) as never) });
  app.use(i18n());
  app.directive('activate', {});
  return renderToString(app);
}

describe('SourcesContent', () => {
  it('shows the error banner and the edit shortcut for auth errors', async () => {
    const html = await render({ error: 'Unauthorized', isAuthError: true });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Unauthorized');
    expect(html).toContain('Edit source');
    expect(await render({ error: 'Boom' })).not.toContain('Edit source');
  });

  it('renders the page view when a page item is present', async () => {
    const html = await render({ isPage: true, pageItem: page, rows: [row] });
    expect(html).toContain('Series');
    expect(html).toContain('Odcinek 1');
  });

  it('renders the carousel for the carousel view mode', async () => {
    const html = await render({ viewMode: 'carousel', items: [row], displayItems: [row] });
    expect(html).toContain('data-testid="sources-carousel"');
  });

  it('renders the player list for the player view mode', async () => {
    const html = await render({ viewMode: 'player', items: [row], displayItems: [row] });
    expect(html).toContain('data-testid="sources-player"');
  });

  it('shows the loader while loading and the empty state once settled', async () => {
    expect(await render({ loading: true })).toContain('Refresh');
    expect(await render({ loading: false })).toContain('No items');
  });

  it('offers load more only with more items and a non-page pagination mode', async () => {
    const base = { viewMode: 'carousel', items: [row], displayItems: [row] };
    expect(await render({ ...base, hasMore: true, paginationMode: 'offset' })).toContain(
      'Load more'
    );
    expect(await render({ ...base, hasMore: false, paginationMode: 'offset' })).not.toContain(
      'Load more'
    );
    expect(await render({ ...base, hasMore: true, paginationMode: 'page' })).not.toContain(
      'Load more'
    );
  });
});
