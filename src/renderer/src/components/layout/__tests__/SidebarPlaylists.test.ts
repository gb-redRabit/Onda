import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  ui: null as any,
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));

import SidebarPlaylists from '../SidebarPlaylists.vue';

let wrapper: VueWrapper | null = null;

function track(name: string) {
  return { id: name, name, path: `D:/music/${name}.mp3` } as never;
}

function setup() {
  wrapper = mount(SidebarPlaylists, {
    global: {
      directives: { activate: {} },
      mocks: { $t: (key: string) => key }
    }
  });
  return wrapper;
}

function header() {
  return wrapper!.findAll('button').find((button) => button.text().includes('library.playlists'))!;
}

function playlistRows() {
  return wrapper!.findAll('.group');
}

function deleteButton() {
  return wrapper!.get('[aria-label="common.delete"]');
}

function drag(type: string, data?: unknown) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: data === undefined ? null : { getData: vi.fn(() => data) }
  });
  return event;
}

beforeEach(() => {
  state.library = reactive({
    playlists: [
      { id: 'p1', name: 'Mix', tracks: [track('a'), track('b')] },
      { id: 'p2', name: 'Solo', tracks: [track('c')] },
      { id: 'p3', name: 'Empty', tracks: [] }
    ],
    tracks: [track('a'), track('b'), track('c'), track('d')],
    createPlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    addToPlaylist: vi.fn()
  });
  state.player = {
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn()
  };
  state.ui = { notify: vi.fn() };
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.restoreAllMocks();
});

describe('collapsing', () => {
  it('shows playlists with counts and toggles the section', async () => {
    setup();

    expect(header().text()).toContain('library.playlists');
    expect(header().text()).toContain('3');
    expect(playlistRows()).toHaveLength(3);
    expect(wrapper!.text()).toContain('Mix');

    await header().trigger('click');

    expect(playlistRows()).toHaveLength(0);
    expect(wrapper!.text()).not.toContain('library.newPlaylist');

    await header().trigger('click');
    expect(playlistRows()).toHaveLength(3);
  });
});

describe('playing', () => {
  it('clears the queue and queues the rest of the playlist', async () => {
    setup();
    await playlistRows()[0].trigger('click');

    expect(state.player.clearQueue).toHaveBeenCalledTimes(1);
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith(
      state.library.playlists[0].tracks.slice(1)
    );
    expect(state.player.setTrack).toHaveBeenCalledWith(state.library.playlists[0].tracks[0]);
    expect(state.player.play).toHaveBeenCalledTimes(1);
  });

  it('does not queue anything for a single track', async () => {
    setup();
    await playlistRows()[1].trigger('click');

    expect(state.player.addToQueueMultiple).not.toHaveBeenCalled();
    expect(state.player.setTrack).toHaveBeenCalledTimes(1);
  });

  it('ignores empty playlists', async () => {
    setup();
    await playlistRows()[2].trigger('click');

    expect(state.player.clearQueue).not.toHaveBeenCalled();
    expect(state.player.play).not.toHaveBeenCalled();
  });
});

describe('deleting', () => {
  it('deletes without starting playback', async () => {
    setup();
    const stop = vi.spyOn(Event.prototype, 'stopPropagation');

    await deleteButton().trigger('click');

    expect(stop).toHaveBeenCalled();
    expect(state.library.deletePlaylist).toHaveBeenCalledWith('p1');
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });
});

describe('creating', () => {
  it('creates a trimmed playlist and closes the form', async () => {
    setup();
    const newButton = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('library.newPlaylist'))!;
    await newButton.trigger('click');

    const input = wrapper!.get('input');
    expect(input.attributes('placeholder')).toBe('library.playlistName');
    await input.setValue('  Road trip  ');
    await input.trigger('keydown', { key: 'Enter' });

    expect(state.library.createPlaylist).toHaveBeenCalledWith('Road trip');
    expect(wrapper!.find('input').exists()).toBe(false);
  });

  it('ignores blank names', async () => {
    setup();
    const newButton = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('library.newPlaylist'))!;
    await newButton.trigger('click');
    const input = wrapper!.get('input');
    await input.setValue('   ');
    await input.trigger('keydown', { key: 'Enter' });

    expect(state.library.createPlaylist).not.toHaveBeenCalled();
    expect(wrapper!.find('input').exists()).toBe(true);
  });

  it('closes on Escape', async () => {
    setup();
    const newButton = wrapper!
      .findAll('button')
      .find((button) => button.text().includes('library.newPlaylist'))!;
    await newButton.trigger('click');
    expect(wrapper!.find('input').exists()).toBe(true);

    await wrapper!.get('input').trigger('keydown', { key: 'Escape' });

    expect(wrapper!.find('input').exists()).toBe(false);
    expect(state.library.createPlaylist).not.toHaveBeenCalled();
  });
});

describe('drag and drop', () => {
  it('adds dropped tracks that exist in the library', async () => {
    setup();
    const payload = JSON.stringify({ paths: ['D:/music/a.mp3', 'D:/music/d.mp3', 'missing'] });

    playlistRows()[0].element.dispatchEvent(drag('drop', payload));

    expect(state.library.addToPlaylist.mock.calls).toEqual([
      ['p1', state.library.tracks[0]],
      ['p1', state.library.tracks[3]]
    ]);
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'common.addToPlaylist');
  });

  it('highlights the row during drag', async () => {
    setup();

    playlistRows()[0].element.dispatchEvent(drag('dragover'));
    await wrapper!.vm.$nextTick();
    expect(playlistRows()[0].classes()).toContain('ring-1');

    playlistRows()[0].element.dispatchEvent(drag('dragleave'));
    await wrapper!.vm.$nextTick();
    expect(playlistRows()[0].classes()).not.toContain('ring-1');
  });

  it('clears the highlight after a drop', async () => {
    setup();
    playlistRows()[0].element.dispatchEvent(drag('dragover'));
    await wrapper!.vm.$nextTick();

    playlistRows()[0].element.dispatchEvent(
      drag('drop', JSON.stringify({ paths: ['D:/music/a.mp3'] }))
    );
    await wrapper!.vm.$nextTick();

    expect(playlistRows()[0].classes()).not.toContain('ring-1');
  });

  it('ignores foreign or malformed payloads', async () => {
    setup();
    const row = playlistRows()[0];

    row.element.dispatchEvent(drag('drop'));
    row.element.dispatchEvent(drag('drop', 'not json'));
    row.element.dispatchEvent(drag('drop', JSON.stringify({ paths: 'nope' })));

    expect(state.library.addToPlaylist).not.toHaveBeenCalled();
    expect(state.ui.notify).not.toHaveBeenCalled();
  });

  it('notifies even when no dropped path matches a track', async () => {
    setup();

    playlistRows()[0].element.dispatchEvent(
      drag('drop', JSON.stringify({ paths: ['D:/music/unknown.mp3'] }))
    );

    expect(state.library.addToPlaylist).not.toHaveBeenCalled();
    expect(state.ui.notify).toHaveBeenCalledWith('success', 'common.addToPlaylist');
  });
});
