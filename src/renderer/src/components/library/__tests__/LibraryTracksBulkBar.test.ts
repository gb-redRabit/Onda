import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import LibraryTracksBulkBar from '../LibraryTracksBulkBar.vue';

function mountBar(
  props: Partial<{ count: number; playlists: { id: string; name: string }[] }> = {}
) {
  return mount(LibraryTracksBulkBar, {
    props: {
      count: 2,
      playlists: [
        { id: 'p1', name: 'Playlist one' },
        { id: 'p2', name: 'Playlist two' }
      ],
      ...props
    },
    global: { mocks: { $t: (key: string) => key } }
  });
}

describe('LibraryTracksBulkBar', () => {
  it('shows the selection count', () => {
    expect(mountBar({ count: 3 }).text()).toContain('3 common.selected');
  });

  it('uses plural action labels for multiple tracks', () => {
    const text = mountBar({ count: 2 }).text();

    expect(text).toContain('common.addToQueue');
    expect(text).toContain('common.addToPlaylist');
  });

  it('uses singular action labels for one track', () => {
    const text = mountBar({ count: 1 }).text();

    expect(text).toContain('common.addTrackToQueue');
    expect(text).toContain('common.addTrackToPlaylist');
  });

  it('emits play, queue and clear', async () => {
    const wrapper = mountBar();

    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.findAll('button')[1].trigger('click');
    await wrapper.get('[data-testid="library-selection-clear"]').trigger('click');

    expect(wrapper.emitted('play')).toEqual([[]]);
    expect(wrapper.emitted('queue')).toEqual([[]]);
    expect(wrapper.emitted('clear')).toEqual([[]]);
  });

  it('opens the playlist menu and emits the chosen playlist', async () => {
    const wrapper = mountBar();
    expect(wrapper.text()).not.toContain('Playlist one');

    await wrapper.findAll('button')[2].trigger('click');
    expect(wrapper.text()).toContain('Playlist one');

    const items = wrapper.findAll('.absolute button');
    await items[1].trigger('click');

    expect(wrapper.emitted('add-to-playlist')).toEqual([['p2']]);
  });

  it('closes the playlist menu on a second click', async () => {
    const wrapper = mountBar();
    const toggle = wrapper.findAll('button')[2];

    await toggle.trigger('click');
    await toggle.trigger('click');

    expect(wrapper.text()).not.toContain('Playlist one');
  });

  it('shows a placeholder without playlists', async () => {
    const wrapper = mountBar({ playlists: [] });

    await wrapper.findAll('button')[2].trigger('click');

    expect(wrapper.text()).toContain('common.noPlaylists');
  });
});
