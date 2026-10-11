import { describe, it, expect } from 'vitest';
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import SourcePhaseRail from '../SourcePhaseRail.vue';
import type { PhaseItem } from '../sourcePhases';

const phases: PhaseItem[] = [
  { key: 'source', kind: 'source', label: 'My API', status: null },
  { key: 'e1', kind: 'endpoint', label: 'Lista', type: 'list', status: 'ok' },
  { key: 'e2', kind: 'endpoint', label: 'Odcinki', type: 'page', status: 'invalid' },
  { key: 'test', kind: 'test', label: 'Test', status: null }
];

async function render(props: Record<string, unknown>): Promise<string> {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        common: { delete: 'Delete' },
        sources: {
          levels: 'Levels',
          addLevel: 'Add level',
          phaseSource: 'Source',
          phaseTest: 'Test',
          typeList: 'List',
          typePage: 'Page'
        }
      }
    },
    missingWarn: false,
    fallbackWarn: false
  });
  const app = createSSRApp({ render: () => h(SourcePhaseRail, props as never) });
  app.use(i18n);
  return renderToString(app);
}

describe('SourcePhaseRail', () => {
  it('renders every phase with its label and add button', async () => {
    const html = await render({ phases, active: 1 });
    expect(html).toContain('role="tablist"');
    expect(html).toContain('My API');
    expect(html).toContain('Lista');
    expect(html).toContain('Odcinki');
    expect(html).toContain('Test');
    expect(html).toContain('Add level');
  });

  it('marks the active phase and shows a remove button per endpoint only', async () => {
    const html = await render({ phases, active: 1 });
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1);
    // Usuwanie tylko dla faz endpointów (2 z 4).
    expect((html.match(/aria-label="Delete"/g) ?? []).length).toBe(2);
  });
});
