import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourceHealthBar from '../SourceHealthBar.vue';

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        sources: {
          health: {
            checking: 'Checking…',
            ok: 'Connection OK',
            fail: 'Connection failed',
            unknown: 'No data',
            checkedAt: 'Last test',
            items: 'Items: {n}',
            downloaded: 'Downloaded: {n}'
          }
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourceHealthBar, props as any) });
  app.use(i18n);
  return renderToString(app);
}

describe('SourceHealthBar', () => {
  it('shows a success state with counts', async () => {
    const html = await render({ state: 'ok', itemCount: 3, downloadedCount: 1 });
    expect(html).toContain('source-health');
    expect(html).toContain('Connection OK');
    expect(html).toContain('Items: 3');
    expect(html).toContain('Downloaded: 1');
  });

  it('shows the checking state', async () => {
    const html = await render({ state: 'checking', itemCount: 0, downloadedCount: 0 });
    expect(html).toContain('Checking');
  });

  it('shows a failure state', async () => {
    const html = await render({
      state: 'fail',
      error: 'boom',
      itemCount: 1,
      downloadedCount: 0
    });
    expect(html).toContain('Connection failed');
  });

  it('shows an unknown state before the first test', async () => {
    const html = await render({ state: 'unknown', itemCount: 0, downloadedCount: 0 });
    expect(html).toContain('No data');
    expect(html).not.toContain('Connection failed');
  });
});
