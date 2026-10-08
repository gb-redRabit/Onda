import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourceCompact from '../SourceCompact.vue';
import type { SourceItem } from '@renderer/types/sources';

const items: SourceItem[] = [
  { id: 'a', title: 'Odcinek 1', subtitle: 'S1', type: 'video', duration: '24:00' },
  { id: 'b', title: '', type: 'audio' }
];

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
  const app = createSSRApp({ render: () => h(SourceCompact, props as never) });
  app.use(i18n);
  app.directive('activate', {});
  return renderToString(app);
}

describe('SourceCompact', () => {
  it('renders a dense row per item with duration and untitled fallback', async () => {
    const html = await render({ items });
    expect(html).toContain('sources-compact');
    expect(html).toContain('Odcinek 1');
    expect(html).toContain('24:00');
    expect(html).toContain('Untitled');
  });

  it('shows the download button only when downloadable', async () => {
    const withUrl: SourceItem[] = [
      { id: 'a', title: 'A', type: 'video', mediaUrl: 'https://c/a.mp4' }
    ];
    expect(await render({ items: withUrl, downloadable: false })).not.toContain('Download');
    expect(await render({ items: withUrl, downloadable: true })).toContain('Download');
  });

  it('reflects the selection state in select mode', async () => {
    const html = await render({ items, selectable: true, selectedIds: new Set(['a']) });
    expect(html).toContain('ring-primary');
  });
});
