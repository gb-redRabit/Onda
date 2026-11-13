import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}:${JSON.stringify(params)}` : key
    })
  };
});

import MusicBrainzBatchPanel from '../MusicBrainzBatchPanel.vue';
import SourcePhaseTest from '../../sources/SourcePhaseTest.vue';
import SubscribePrefsSummary from '../../online/SubscribePrefsSummary.vue';

const results = [
  { path: '/a.mp3', name: 'A', status: 'ok' as const, msg: 'updated' },
  { path: '/b.mp3', name: 'B', status: 'error' as const, msg: 'failed' },
  { path: '/c.mp3', name: 'C', status: 'pending' as const }
];

function mountBatch(over: Record<string, unknown> = {}) {
  return mount(MusicBrainzBatchPanel, {
    props: { total: 10, progress: 4, results, running: false, ...over },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('MusicBrainzBatchPanel', () => {
  it('shows the summary, progress and statuses', () => {
    const wrapper = mountBatch();
    const text = wrapper.text();

    expect(text).toContain('musicbrainz.batchSummary');
    expect(wrapper.get('.bg-primary.h-2').attributes('style')).toContain('width: 40%');
    expect(text).toContain('updated');
    expect(text).toContain('failed');
    expect(wrapper.findAll('.text-success')).toHaveLength(1);
    expect(wrapper.findAll('.text-error').length).toBeGreaterThanOrEqual(1);
  });

  it('handles zero totals', () => {
    const wrapper = mountBatch({ total: 0, progress: 0 });

    expect(wrapper.get('.bg-primary.h-2').attributes('style')).toContain('width: 0%');
  });

  it('starts the batch', async () => {
    const wrapper = mountBatch();
    const start = wrapper.get('button');

    expect(start.text()).toContain('musicbrainz.applyAll');
    await start.trigger('click');

    expect(wrapper.emitted('start')).toEqual([[]]);
  });

  it('cancels a running batch', async () => {
    const wrapper = mountBatch({ running: true });
    const cancel = wrapper.get('button');

    expect(cancel.text()).toContain('musicbrainz.cancelProgress');
    await cancel.trigger('click');

    expect(wrapper.emitted('cancel')).toEqual([[]]);
  });
});

function mountPhase(over: Record<string, unknown> = {}) {
  return mount(SourcePhaseTest, {
    props: {
      saveHint: false,
      testMsg: '',
      testPassed: false,
      prettyRaw: '',
      headerRows: [],
      errorMsg: '',
      ...over
    }
  });
}

describe('SourcePhaseTest', () => {
  it('runs the test', async () => {
    const wrapper = mountPhase();

    await wrapper.get('[data-testid="sources-phase-test-run"]').trigger('click');

    expect(wrapper.emitted('test')).toEqual([[]]);
    expect(wrapper.text()).toContain('sources.test');
  });

  it('shows success and failure messages', () => {
    const ok = mountPhase({ testMsg: 'Works', testPassed: true });
    expect(ok.get('p').classes()).toContain('text-success');

    const failed = mountPhase({ testMsg: 'Broken', testPassed: false });
    expect(failed.get('p').classes()).toContain('text-error');
    expect(failed.text()).toContain('Broken');
  });

  it('shows the save hint only when requested', () => {
    expect(mountPhase().text()).not.toContain('sources.testSaveHint');
    expect(mountPhase({ saveHint: true }).text()).toContain('sources.testSaveHint');
  });

  it('shows raw responses and headers', () => {
    const wrapper = mountPhase({
      prettyRaw: '{"a":1}',
      headerRows: [
        ['content-type', 'application/json'],
        ['set-cookie', '***']
      ]
    });

    expect(wrapper.get('[data-testid="source-test-raw"]').text()).toContain('{"a":1}');
    expect(wrapper.get('[data-testid="source-test-raw"]').text()).toContain('sources.testRaw');
    expect(wrapper.get('[data-testid="source-test-headers"]').text()).toContain('content-type');
    expect(wrapper.get('[data-testid="source-test-headers"]').text()).toContain('***');
  });

  it('hides optional details and shows errors', () => {
    const wrapper = mountPhase({ errorMsg: 'network down' });

    expect(wrapper.find('[data-testid="source-test-raw"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="source-test-headers"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('network down');
  });
});

describe('SubscribePrefsSummary', () => {
  it('renders a row per summary item', () => {
    const wrapper = mount(SubscribePrefsSummary, {
      props: {
        items: [
          { label: 'Format', value: 'mp3' },
          { label: 'Quality', value: 'best' }
        ]
      }
    });

    expect(wrapper.text()).toContain('youtube.prefsSummary');
    expect(wrapper.text()).toContain('Format');
    expect(wrapper.text()).toContain('mp3');
    expect(wrapper.findAll('.truncate')).toHaveLength(2);
    expect(wrapper.find('[title="best"]').exists()).toBe(true);
  });

  it('renders an empty grid without items', () => {
    const wrapper = mount(SubscribePrefsSummary, { props: { items: [] } });

    expect(wrapper.findAll('.truncate')).toHaveLength(0);
    expect(wrapper.text()).toContain('youtube.prefsSummary');
  });
});
