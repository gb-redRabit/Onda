import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

const Icon = defineComponent({ name: 'StatIcon', template: '<i data-testid="stat-icon" />' });

import HomeStatsPanel from '../HomeStatsPanel.vue';

const items = [
  { value: 10, key: 'home.totalTracks', color: 'text-primary', tab: 'tracks', icon: Icon },
  { value: 3, key: 'home.totalAlbums', color: 'text-success', tab: 'albums', icon: Icon },
  { value: 2, key: 'home.totalArtists', color: 'text-warning', tab: 'artists', icon: Icon }
];

function mountPanel(over: Record<string, unknown> = {}) {
  return mount(HomeStatsPanel, {
    props: { items: items as never, loading: false, ...over },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('HomeStatsPanel', () => {
  it('renders the library header counter', () => {
    const wrapper = mountPanel();
    const header = wrapper.get('[data-testid="home-counter-tracks"]');

    expect(header.text()).toContain('home.libraryStats');
    expect(header.text()).toContain('10');
    expect(header.text()).toContain('home.totalTracks');
  });

  it('renders one row per remaining item', () => {
    const wrapper = mountPanel();
    const rows = wrapper.findAll('[data-testid^="home-counter-"]');

    expect(rows).toHaveLength(3);
    expect(wrapper.text()).toContain('home.totalAlbums');
    expect(wrapper.text()).toContain('home.totalArtists');
    expect(wrapper.findAll('[data-testid="stat-icon"]')).toHaveLength(2);
  });

  it('opens the matching library tab', async () => {
    const wrapper = mountPanel();
    const rows = wrapper.findAll('[data-testid^="home-counter-"]');

    await rows[0].trigger('click');
    await rows[2].trigger('click');

    expect(wrapper.emitted('open')).toEqual([['tracks'], ['artists']]);
  });

  it('shows loading skeletons instead of rows', () => {
    const wrapper = mountPanel({ loading: true });

    expect(wrapper.findAll('.animate-pulse')).toHaveLength(12);
    expect(wrapper.findAll('[data-testid^="home-counter-"]')).toHaveLength(1);
  });

  it('hides the header without items', () => {
    const wrapper = mountPanel({ items: [] });

    expect(wrapper.find('[data-testid^="home-counter-"]').exists()).toBe(false);
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('renders only the header with a single item', () => {
    const wrapper = mountPanel({ items: [items[0]] });

    expect(wrapper.findAll('[data-testid^="home-counter-"]')).toHaveLength(1);
  });
});
