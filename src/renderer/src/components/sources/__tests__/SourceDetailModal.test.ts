import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import SourceDetailModal from '../SourceDetailModal.vue';
import type { SourceItem } from '@renderer/types/sources';

const item: SourceItem = {
  id: 'x',
  title: 'Odcinek 1',
  subtitle: 'Sezon 1',
  duration: '24:00',
  type: 'video',
  sourceUrl: 'https://site/watch/x'
};

function i18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        common: { close: 'Close' },
        sources: {
          untitled: 'Untitled',
          titleField: 'Title',
          subtitleField: 'Subtitle',
          durationField: 'Duration',
          sourceUrlField: 'Source URL',
          openInBrowser: 'Open in browser',
          openInPreview: 'Open in preview window',
          download: 'Download',
          downloaded: 'Downloaded',
          unmarkDownloaded: 'Unmark as downloaded'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
}

// ModalShell teleportuje do <body>, więc treść dialogu trafia do kontekstu SSR.
async function render(props: Record<string, unknown>): Promise<string> {
  const app: App = createSSRApp({ render: () => h(SourceDetailModal, props as never) });
  app.use(i18n());
  const ctx: { teleports?: Record<string, string> } = {};
  const appHtml = await renderToString(app, ctx);
  return (ctx.teleports?.body ?? '') + appHtml;
}

describe('SourceDetailModal', () => {
  it('renders the header, type badge and metadata', async () => {
    const html = await render({ item });
    expect(html).toContain('Odcinek 1');
    expect(html).toContain('video');
    expect(html).toContain('Subtitle');
    expect(html).toContain('Duration');
    expect(html).toContain('24:00');
    expect(html).toContain('Source URL');
  });

  it('renders nothing when there is no item', async () => {
    const html = await render({ item: null });
    expect(html).not.toContain('source-detail-modal-title');
  });

  it('embeds the player and shows the preview action when playerUrl is set', async () => {
    const html = await render({
      item: { id: 'p', title: 'Player', type: 'video', playerUrl: 'https://p/embed' }
    });
    expect(html).toContain('data-testid="embed-webview"');
    expect(html).toContain('Open in preview window');
  });

  it('shows the download button only when the level is downloadable and a url exists', async () => {
    const withUrl: SourceItem = { id: 'm', title: 'M', type: 'video', mediaUrl: 'https://m/a.mp4' };
    expect(await render({ item: withUrl, downloadable: false })).not.toContain('>Download<');
    const html = await render({ item: withUrl, downloadable: true });
    expect(html).toContain('Download');
  });

  it('reflects the downloaded state and offers unmark', async () => {
    const withUrl: SourceItem = { id: 'm', title: 'M', type: 'video', mediaUrl: 'https://m/a.mp4' };
    const html = await render({ item: withUrl, downloadable: true, downloaded: true });
    expect(html).toContain('Downloaded');
    expect(html).toContain('Unmark as downloaded');
  });
});
