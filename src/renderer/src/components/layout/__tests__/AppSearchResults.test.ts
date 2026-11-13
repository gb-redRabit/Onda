import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import AppSearchResults from '../AppSearchResults.vue';

const folderIcon = { name: 'FolderIcon', template: '<i />' };

const trackA = { type: 'track', label: 'Track A', sub: 'Artist', track: { type: 'audio' } };
const trackB = { type: 'track', label: 'Video B', sub: 'Artist', track: { type: 'video' } };
const playlist = { type: 'playlist', label: 'Playlist C', sub: '3 items' };
const command = { type: 'command', label: 'Go home', icon: folderIcon };

const groups = [
  { key: 'tracks', label: 'Tracks', items: [trackA, trackB] },
  { key: 'other', label: 'Other', items: [playlist, command] }
];
const flatItems = [trackA, trackB, playlist, command];

function mountResults(activeIndex = 0) {
  return mount(AppSearchResults, {
    props: { groups: groups as never, flatItems: flatItems as never, activeIndex },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('AppSearchResults', () => {
  it('renders group headers and options', () => {
    const wrapper = mountResults();
    const options = wrapper.findAll('[role="option"]');

    expect(wrapper.text()).toContain('Tracks');
    expect(wrapper.text()).toContain('Other');
    expect(options).toHaveLength(4);
    expect(options[0].attributes('id')).toBe('app-search-item-0');
  });

  it('marks the active option', () => {
    const wrapper = mountResults(2);
    const options = wrapper.findAll('[role="option"]');

    expect(options[2].attributes('aria-selected')).toBe('true');
    expect(options[2].classes()).toContain('bg-primary/10');
    expect(options[0].attributes('aria-selected')).toBe('false');
  });

  it('runs the clicked option', async () => {
    const wrapper = mountResults();

    await wrapper.findAll('[role="option"]')[1].trigger('click');

    expect(wrapper.emitted('run')).toEqual([[trackB]]);
  });

  it('runs non-track entries and activates them on hover', async () => {
    const wrapper = mountResults();

    await wrapper.findAll('[role="option"]')[2].trigger('mouseenter');
    await wrapper.findAll('[role="option"]')[2].trigger('click');

    expect(wrapper.emitted('activate')).toContainEqual([2]);
    expect(wrapper.emitted('run')).toEqual([[playlist]]);
  });

  it('activates the hovered track', async () => {
    const wrapper = mountResults();

    await wrapper.findAll('[role="option"]')[1].trigger('mouseenter');

    expect(wrapper.emitted('activate')).toEqual([[1]]);
  });

  it('activates the hovered option', async () => {
    const wrapper = mountResults();

    await wrapper.findAll('[role="option"]')[3].trigger('mouseenter');

    expect(wrapper.emitted('activate')).toEqual([[3]]);
  });

  it('renders track subtitles and playlist counts', () => {
    const wrapper = mountResults();
    const text = wrapper.text();

    expect(text).toContain('Track A');
    expect(text).toContain('Video B');
    expect(text).toContain('Playlist C');
    expect(text).toContain('3 items');
  });

  it('shows an empty state', () => {
    const wrapper = mount(AppSearchResults, {
      props: { groups: [] as never, flatItems: [] as never, activeIndex: 0 },
      global: { mocks: { $t: (key: string) => key } }
    });

    expect(wrapper.text()).toContain('cmdPalette.empty');
  });
});
