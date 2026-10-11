import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourcesQueryBuilder from '../SourcesQueryBuilder.vue';

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: { en: { sources: { queryBuilderParams: 'Query parameters' } } },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({
    render: () =>
      h(SourcesQueryBuilder, {
        modelValue: {},
        'onUpdate:modelValue': () => {},
        ...props
      } as never)
  });
  app.use(i18n);
  return renderToString(app);
}

describe('SourcesQueryBuilder', () => {
  it('renders one labelled input per configured param with its default as placeholder', async () => {
    const html = await render({
      keys: ['rating', 'page'],
      defaults: { rating: 'safe', page: '1' }
    });
    expect(html).toContain('sources-query-builder');
    expect(html).toContain('Query parameters');
    expect(html).toContain('rating');
    expect(html).toContain('safe');
    expect(html).toContain('page');
  });

  it('renders nothing without configured params', async () => {
    const html = await render({ keys: [], defaults: {} });
    expect(html).not.toContain('sources-query-builder');
  });
});
