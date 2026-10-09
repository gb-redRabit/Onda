import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourceCarousel from '../SourceCarousel.vue';
import type { SourceItem } from '@renderer/types/sources';

const items: SourceItem[] = [
  { id: 'a', title: 'Alpha', type: 'video', playerUrl: 'https://p/a' },
  { id: 'b', title: 'Beta', type: 'image', thumbnail: 'https://img/b.jpg' }
];

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: { sources: { download: 'Download', downloaded: 'Downloaded', untitled: 'Untitled' } }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourceCarousel, props as never) });
  app.use(i18n);
  app.directive('activate', {});
  return renderToString(app);
}

// Zawartość karuzeli jest wirtualizowana poziomo, więc SSR (bez layoutu/scrolla)
// renderuje tylko kontener — kafelki montują się po stronie klienta.
describe('SourceCarousel', () => {
  it('renders the horizontal scroll container', async () => {
    const html = await render({ items });
    expect(html).toContain('data-testid="sources-carousel"');
  });

  it('renders the empty container without items or playable marks', async () => {
    const html = await render({ items: [] });
    expect(html).toContain('data-testid="sources-carousel"');
    expect(html).not.toContain('source-playable');
  });
});
