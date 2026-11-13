import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return { ...actual, useI18n: () => ({ t: (key: string) => key }) };
});

import DownloadFiltersBar from '../DownloadFiltersBar.vue';

const filters = [
  { id: 'all', labelKey: 'downloads.filterAll', count: 10 },
  { id: 'active', labelKey: 'downloads.filterActive', count: 3 }
];

function mountBar(over: Record<string, unknown> = {}) {
  return mount(DownloadFiltersBar, {
    props: {
      filters: filters as never,
      channels: [
        ['c1', 'Channel one'],
        ['c2', 'Channel two']
      ],
      filter: 'all',
      channelFilter: '',
      ...over
    }
  });
}

describe('DownloadFiltersBar', () => {
  it('renders labelled filter buttons with counts', () => {
    const wrapper = mountBar();
    const buttons = wrapper.findAll('[data-testid^="downloads-filter-"]');

    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toBe('downloads.filterAll (10)');
    expect(buttons[1].text()).toBe('downloads.filterActive (3)');
  });

  it('marks the active filter', () => {
    const wrapper = mountBar({ filter: 'active' });

    expect(wrapper.get('[data-testid="downloads-filter-active"]').attributes('aria-pressed')).toBe(
      'true'
    );
    expect(wrapper.get('[data-testid="downloads-filter-all"]').attributes('aria-pressed')).toBe(
      'false'
    );
    expect(wrapper.get('[data-testid="downloads-filter-active"]').classes()).toContain(
      'bg-primary/18'
    );
  });

  it('emits the selected filter', async () => {
    const wrapper = mountBar();

    await wrapper.get('[data-testid="downloads-filter-active"]').trigger('click');

    expect(wrapper.emitted('update:filter')).toEqual([['active']]);
  });

  it('renders the channel selector with all channels', () => {
    const wrapper = mountBar();
    const select = wrapper.get('select');
    const options = select.findAll('option');

    expect(select.attributes('aria-label')).toBe('downloads.filterChannel');
    expect(options.map((o) => o.text())).toEqual([
      'downloads.filterAllChannels',
      'Channel one',
      'Channel two'
    ]);
    expect(options.map((o) => o.attributes('value'))).toEqual(['', 'c1', 'c2']);
  });

  it('emits channel changes', async () => {
    const wrapper = mountBar();

    await wrapper.get('select').setValue('c2');

    expect(wrapper.emitted('update:channelFilter')).toEqual([['c2']]);
  });

  it('hides the selector without channels', () => {
    expect(mountBar({ channels: [] }).find('select').exists()).toBe(false);
  });
});
