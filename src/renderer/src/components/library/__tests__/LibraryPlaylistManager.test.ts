import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import LibraryPlaylistManager from '../LibraryPlaylistManager.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  ui: null as any,
  contextMenu: null as any,
  prompt: null as any,
  t: vi.fn((key: string) => key),
  trackCount: vi.fn((n: number) => `count:${n}`)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => state.contextMenu
}));
vi.mock('@renderer/composables/usePromptDialog', () => ({ usePromptDialog: () => state.prompt }));
vi.mock('@renderer/composables/useCountLabel', () => ({
  useCountLabel: () => ({ trackCount: state.trackCount })
}));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: (options: { count: () => number; estimateSize: () => number }) => ({
    getTotalSize: () => options.count() * options.estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: options.count() }, (_, index) => ({
        index,
        key: index,
        size: options.estimateSize(),
        start: index * options.estimateSize()
      }))
  })
}));

const TrackRowStub = {
  props: ['track', 'playlistId', 'dragIndex'],
  emits: ['play'],
  template: '<div data-testid="track-row">{{ track.name }}</div>'
};
const PromptStub = {
  props: ['visible', 'isConfirm', 'message', 'value'],
  emits: ['update:value', 'confirm', 'cancel'],
  template: '<div data-testid="prompt">{{ message }}</div>'
};

let wrapper: VueWrapper | null = null;

function track(id: string, name: string) {
  return {
    id,
    name,
    path: `C:\\music\\${name}.mp3`,
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    size: 1,
    type: 'audio',
    metadata: {},
    addedAt: 0,
    playCount: 0
  } as never;
}

function playlist(id: string, name: string, tracks: unknown[] = []) {
  return { id, name, tracks } as never;
}

function mountManager() {
  wrapper = mount(LibraryPlaylistManager, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { LibraryTrackRow: TrackRowStub, ExplorerPromptDialog: PromptStub }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

function playlistButtons() {
  return wrapper!.findAll('button.w-full');
}

function nameInput() {
  return wrapper!.get('input[placeholder="library.playlistName"]');
}

async function typeName(value: string): Promise<void> {
  const input = nameInput();
  (input.element as HTMLInputElement).value = value;
  await input.trigger('input');
}

function createButton() {
  return wrapper!.get('[aria-label="library.playlistCreate"]');
}

function dropEvent(payload: unknown) {
  return {
    dataTransfer: {
      getData: (type: string) => (type === 'text/plain' ? JSON.stringify(payload) : '')
    }
  };
}

beforeEach(() => {
  const tracks = [track('t1', 'First'), track('t2', 'Second'), track('t3', 'Third')];
  let nextId = 1;
  state.library = reactive({
    playlists: [playlist('p1', 'Chill', tracks), playlist('p2', 'Empty', [])],
    tracks,
    createPlaylist: vi.fn((name: string) => {
      const p = { id: `new${nextId++}`, name, tracks: [] };
      state.library.playlists.push(p);
      return p;
    }),
    deletePlaylist: vi.fn((id: string) => {
      state.library.playlists = state.library.playlists.filter((p: { id: string }) => p.id !== id);
    }),
    addToPlaylist: vi.fn(),
    reorderPlaylistTrack: vi.fn(),
    renamePlaylist: vi.fn()
  });
  state.player = {
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn()
  };
  state.ui = { notify: vi.fn() };
  state.contextMenu = { showPlaylistMenu: vi.fn() };
  state.prompt = {
    promptVisible: ref(false),
    promptIsConfirm: ref(false),
    promptMessage: ref(''),
    promptValue: ref(''),
    showConfirm: vi.fn(async () => true),
    showPrompt: vi.fn(async () => null as string | null),
    promptConfirm: vi.fn(),
    promptCancel: vi.fn()
  };
  state.t.mockClear();
  state.trackCount.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
});

describe('playlist list', () => {
  it('shows playlists with track counts and the empty selection hint', () => {
    mountManager();

    expect(wrapper!.text()).toContain('library.playlists');
    expect(wrapper!.text()).toContain('Chill');
    expect(wrapper!.text()).toContain('3');
    expect(wrapper!.text()).toContain('Empty');
    expect(wrapper!.text()).toContain('library.selectPlaylistHint');
  });

  it('shows the empty state when there are no playlists', () => {
    state.library.playlists = [];
    mountManager();
    expect(wrapper!.text()).toContain('common.noPlaylists');
  });

  it('creates a playlist from the input and clears it', async () => {
    mountManager();
    expect(createButton().attributes('disabled')).toBeDefined();

    await typeName('  Road trip  ');
    expect(createButton().attributes('disabled')).toBeUndefined();
    await createButton().trigger('click');

    expect(state.library.createPlaylist).toHaveBeenCalledWith('Road trip');
    expect((nameInput().element as HTMLInputElement).value).toBe('');
    expect(wrapper!.text()).toContain('Road trip');
    expect(wrapper!.text()).toContain('library.playlistEmptyHint');
  });

  it('creates with Enter and ignores blank names', async () => {
    mountManager();
    await typeName('   ');
    await nameInput().trigger('keyup.enter');
    expect(state.library.createPlaylist).not.toHaveBeenCalled();

    await typeName('Enter name');
    await nameInput().trigger('keyup.enter');
    expect(state.library.createPlaylist).toHaveBeenCalledWith('Enter name');
  });

  it('selects a playlist and renders its tracks', async () => {
    mountManager();
    await playlistButtons()[1].trigger('click');

    expect(wrapper!.text()).toContain('Empty');
    expect(wrapper!.text()).toContain('count:0');
    const playAll = wrapper!.findAll('button').find((b) => b.text().includes('library.playAll'))!;
    expect(playAll.attributes('disabled')).toBeDefined();

    await playlistButtons()[0].trigger('click');
    expect(wrapper!.text()).toContain('count:3');
    expect(wrapper!.findAll('[data-testid="track-row"]')).toHaveLength(3);
    expect(wrapper!.findComponent(TrackRowStub).props('playlistId')).toBe('p1');
    expect(wrapper!.findComponent(TrackRowStub).props('dragIndex')).toBe(0);
  });

  it('marks the playlist being dragged over', async () => {
    mountManager();
    const target = playlistButtons()[0];
    await target.trigger('dragover');
    expect(target.classes()).toContain('ring-1');

    await target.trigger('dragleave');
    expect(target.classes()).not.toContain('ring-1');
  });
});

describe('creating and playing', () => {
  it('plays from an index, queueing the remainder', async () => {
    mountManager();
    await playlistButtons()[0].trigger('click');

    wrapper!.findAllComponents(TrackRowStub)[1].vm.$emit('play');
    await flush();

    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 't3' })
    ]);
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
    expect(state.player.play).toHaveBeenCalled();
  });

  it('does not queue anything for the last track', async () => {
    mountManager();
    await playlistButtons()[0].trigger('click');

    wrapper!.findAllComponents(TrackRowStub)[2].vm.$emit('play');
    await flush();

    expect(state.player.addToQueueMultiple).not.toHaveBeenCalled();
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't3' }));
  });

  it('plays all tracks from the header', async () => {
    mountManager();
    await playlistButtons()[0].trigger('click');
    await wrapper!
      .findAll('button')
      .find((b) => b.text().includes('library.playAll'))!
      .trigger('click');

    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 't2' }),
      expect.objectContaining({ id: 't3' })
    ]);
  });

  it('ignores play requests without a selected playlist', async () => {
    mountManager();
    expect(wrapper!.findAllComponents(TrackRowStub)).toHaveLength(0);
    expect(state.player.play).not.toHaveBeenCalled();
  });
});

describe('deleting and renaming', () => {
  it('asks for confirmation and deletes', async () => {
    mountManager();
    await playlistButtons()[0].trigger('click');

    await wrapper!.get('[aria-label="library.deletePlaylist"]').trigger('click');
    await flush();
    expect(state.prompt.showConfirm).toHaveBeenCalledWith('library.playlistDeleteConfirm');
    expect(state.library.deletePlaylist).toHaveBeenCalledWith('p1');
    expect(wrapper!.text()).toContain('library.selectPlaylistHint');
  });

  it('keeps the playlist when deletion is cancelled', async () => {
    state.prompt.showConfirm.mockResolvedValueOnce(false);
    mountManager();
    await playlistButtons()[0].trigger('click');

    await wrapper!.get('[aria-label="library.deletePlaylist"]').trigger('click');
    await flush();
    expect(state.library.deletePlaylist).not.toHaveBeenCalled();
  });

  it('renames from the context menu', async () => {
    state.prompt.showPrompt.mockResolvedValueOnce('New name');
    mountManager();

    await playlistButtons()[0].trigger('contextmenu');
    expect(state.contextMenu.showPlaylistMenu).toHaveBeenCalled();
    const [event, pl, action] = state.contextMenu.showPlaylistMenu.mock.calls[0];
    expect(event).toBeTruthy();
    expect(pl.id).toBe('p1');

    action();
    await flush();
    expect(state.prompt.showPrompt).toHaveBeenCalledWith('ctx.playlistRename', 'Chill');
    expect(state.library.renamePlaylist).toHaveBeenCalledWith('p1', 'New name');
    expect(wrapper!.text()).toContain('count:3');
  });

  it('does not rename when the prompt is dismissed', async () => {
    mountManager();
    await playlistButtons()[0].trigger('contextmenu');
    state.contextMenu.showPlaylistMenu.mock.calls[0][2]();
    await flush();
    expect(state.library.renamePlaylist).not.toHaveBeenCalled();
  });

  it('wires the prompt dialog props and events', async () => {
    mountManager();
    const prompt = wrapper!.findComponent(PromptStub);
    expect(prompt.exists()).toBe(true);

    prompt.vm.$emit('update:value', 'typed');
    expect(state.prompt.promptValue.value).toBe('typed');
    prompt.vm.$emit('confirm');
    prompt.vm.$emit('cancel');
    expect(state.prompt.promptConfirm).toHaveBeenCalled();
    expect(state.prompt.promptCancel).toHaveBeenCalled();
  });
});

describe('drag and drop', () => {
  it('adds library tracks to a playlist dropped on its button', async () => {
    mountManager();
    await playlistButtons()[0].trigger('drop', dropEvent({ paths: ['C:\\music\\First.mp3'] }));

    expect(state.library.addToPlaylist).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ id: 't1' })
    );
    expect(state.ui.notify).toHaveBeenCalledWith('success', expect.stringContaining('Chill'));
  });

  it('ignores invalid or empty drop payloads', async () => {
    mountManager();
    const target = playlistButtons()[0];

    await target.trigger('drop', { dataTransfer: { getData: () => '' } });
    await target.trigger('drop', { dataTransfer: { getData: () => 'not json' } });
    await target.trigger('drop', dropEvent({ dragIndex: 2 }));

    expect(state.library.addToPlaylist).not.toHaveBeenCalled();
    expect(state.ui.notify).not.toHaveBeenCalled();
  });

  it('reorders tracks when dropped within the same playlist', async () => {
    mountManager();
    await playlistButtons()[0].trigger('click');

    const row = wrapper!.findAll('[data-testid="track-row"]')[2].element.parentElement!;
    // Simulate the payload through the component handler by dispatching a real event.
    const event = new Event('drop', { bubbles: true, cancelable: true }) as Event;
    Object.defineProperty(event, 'dataTransfer', {
      value: { getData: () => JSON.stringify({ playlistId: 'p1', dragIndex: 0, paths: [] }) }
    });
    row.dispatchEvent(event);
    await flush();

    expect(state.library.reorderPlaylistTrack).toHaveBeenCalledWith('p1', 0, 1);
  });

  it('adds library tracks dropped on the track list', async () => {
    mountManager();
    await playlistButtons()[0].trigger('click');

    const list = wrapper!.findAll('.overflow-auto')[1];
    await list.trigger(
      'drop',
      dropEvent({ paths: ['C:\\music\\First.mp3', 'C:\\music\\Missing.mp3'] })
    );

    expect(state.library.addToPlaylist).toHaveBeenCalledTimes(1);
    expect(state.library.addToPlaylist).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ id: 't1' })
    );
    expect(state.ui.notify).toHaveBeenCalledWith('success', expect.stringContaining('2'));
  });
});
