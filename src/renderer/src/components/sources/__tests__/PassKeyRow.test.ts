import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import PassKeyRow from '../PassKeyRow.vue';
import type { DraftPassKey } from '../endpointDraft';

async function render(row: DraftPassKey): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        sources: { keyString: 'text', keyNumber: 'number' },
        common: { delete: 'Delete' }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({
    render: () => h(PassKeyRow, { modelValue: row, options: ['slug', 'n'], idBase: 'x' } as any)
  });
  app.use(i18n);
  return renderToString(app);
}

describe('PassKeyRow', () => {
  it('renders the from/as values and the key type options', async () => {
    const html = await render({ from: 'slug', as: 'n', type: 'string' });
    expect(html).toContain('value="slug"');
    expect(html).toContain('value="n"');
    expect(html).toContain('text');
    expect(html).toContain('number');
  });

  it('offers the provided field-path options as a datalist', async () => {
    const html = await render({ from: '', as: '', type: 'string' });
    expect(html).toContain('value="slug"');
    expect(html).toContain('value="n"');
  });
});
