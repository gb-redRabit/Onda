import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h, type App } from 'vue';
import { createI18n } from 'vue-i18n';
import SourceLightbox from '../SourceLightbox.vue';
import type { SourceItem } from '@renderer/types/sources';

const items: SourceItem[] = [
  { id: 'a', title: 'Alpha', type: 'image', mediaUrl: 'https://c/a.jpg' },
  { id: 'b', title: 'Beta', type: 'video', mediaUrl: 'https://c/b.mp4' }
];

function i18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        common: { close: 'Close', previous: 'Previous', next: 'Next' },
        sources: {
          untitled: 'Untitled',
          openInPreview: 'Open in preview window',
          playNow: 'Play now',
          download: 'Download',
          downloaded: 'Downloaded',
          openInBrowser: 'Open in browser'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
}

// Lightbox teleportuje do <body>, więc treść trafia do kontekstu SSR.
async function render(props: Record<string, unknown>): Promise<string> {
  const app: App = createSSRApp({ render: () => h(SourceLightbox, props as never) });
  app.use(i18n());
  const ctx: { teleports?: Record<string, string> } = {};
  const appHtml = await renderToString(app, ctx);
  return (ctx.teleports?.body ?? '') + appHtml;
}

describe('SourceLightbox', () => {
  it('shows the counter, current title and every filmstrip thumbnail', async () => {
    const html = await render({ items, index: 0 });
    expect(html).toContain('1 / 2');
    expect(html).toContain('Alpha');
    expect((html.match(/https:\/\/c\/a\.jpg/g) ?? []).length).toBeGreaterThan(0);
  });

  it('renders the selected video in the stage', async () => {
    const html = await render({ items, index: 1 });
    expect(html).toContain('2 / 2');
    expect(html).toContain('<video');
    expect(html).toContain('https://c/b.mp4');
  });

  it('exposes navigation controls', async () => {
    const html = await render({ items, index: 0 });
    expect(html).toContain('Previous');
    expect(html).toContain('Next');
  });
});
