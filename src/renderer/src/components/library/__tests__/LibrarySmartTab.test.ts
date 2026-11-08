import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import LibrarySmartTab from '../LibrarySmartTab.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  smart: null as any,
  prompt: null as any,
  folders: [
    { id: 'unplayed', labelKey: 'library.smart.unplayed', icon: 'span' },
    { id: 'recent', labelKey: 'library.smart.recent', icon: 'span' }
  ] as any[],
  countFolder: vi.fn(),
  filterFolder: vi.fn(),
  countPlaylist: vi.fn(),
  resolvePlaylist: vi.fn(),
  shuffled: vi.fn(),
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/stores/smart-playlists', () => ({ useSmartPlaylists: () => state.smart }));
vi.mock('@renderer/composables/usePromptDialog', () => ({
  usePromptDialog: () => state.prompt
}));
vi.mock('@renderer/utils/smartFolders', () => ({
  SMART_FOLDERS: state.folders,
  filterSmartFolder: state.filterFolder,
  countSmartFolder: state.countFolder
}));
vi.mock('@renderer/utils/smartPlaylists', () => ({
  countSmartPlaylist: state.countPlaylist,
  resolveSmartPlaylist: state.resolvePlaylist
}));
vi.mock('@renderer/utils/shuffle', () => ({ shuffled: state.shuffled }));

const TracksStub = defineComponent({
  props: { tracks: Array, viewMode: String, query: String },
  emits: ['update:viewMode', 'play', 'play-all', 'shuffle-all', 'edit'],
  template: '<div data-testid="tracks-tab" />'
});
const DialogStub = defineComponent({
  props: ['playlist'],
  emits: ['save', 'cancel'],
  template: '<div data-testid="smart-dialog" />'
});

let wrapper: VueWrapper | null = null;

function track(id: string) {
  return { id, path: `C:/music/${id}.mp3`, name: `${id}.mp3`, type: 'audio' } as any;
}

function smartPlaylist(id: string, overrides: Record<string, unknown> = {}) {
  return { id, name: `Smart ${id}`, match: 'all', rules: [], ...overrides } as any;
}

function mountTab() {
  wrapper = mount(LibrarySmartTab, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { LibraryTracksTab: TracksStub, SmartPlaylistDialog: DialogStub }
    }
  });
  return wrapper;
}

function folderButtons() {
  return wrapper!.findAll('[data-testid^="smart-folder-"]');
}

function playlistButtons() {
  return wrapper!
    .findAll('[data-testid^="smart-playlist-"]')
    .filter((b) => !b.attributes('data-testid')?.endsWith('-new'));
}

beforeEach(() => {
  state.library = reactive({ tracks: [track('a'), track('b')] });
  state.player = reactive({
    favorites: ['C:/music/a.mp3'],
    clearQueue: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn(),
    addToQueueMultiple: vi.fn()
  });
  state.smart = reactive({
    smartPlaylists: [smartPlaylist('sp1'), smartPlaylist('sp2', { name: 'Second' })],
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(() => smartPlaylist('created')),
    update: vi.fn(),
    remove: vi.fn()
  });
  state.prompt = { showConfirm: vi.fn().mockResolvedValue(true) };
  state.folders = [
    { id: 'unplayed', labelKey: 'library.smart.unplayed', icon: 'span' },
    { id: 'recent', labelKey: 'library.smart.recent', icon: 'span' }
  ];
  state.countFolder.mockReset();
  state.countFolder.mockImplementation((id: string) => (id === 'unplayed' ? 3 : 7));
  state.filterFolder.mockReset();
  state.filterFolder.mockImplementation((id: string) =>
    id === 'unplayed' ? [track('a')] : [track('b')]
  );
  state.countPlaylist.mockReset();
  state.countPlaylist.mockImplementation((p: any) => (p.id === 'sp1' ? 4 : 5));
  state.resolvePlaylist.mockReset();
  state.resolvePlaylist.mockImplementation((p: any) => [track(p.id)]);
  state.shuffled.mockReset();
  state.shuffled.mockImplementation((items: any[]) => [...items].reverse());
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('sidebar', () => {
  it('loads smart playlists and renders folders with counts', () => {
    mountTab();
    expect(state.smart.ensureLoaded).toHaveBeenCalled();
    expect(state.countFolder).toHaveBeenCalledWith('unplayed', state.library.tracks, {
      favorites: new Set(['C:/music/a.mp3']),
      now: expect.any(Number)
    });
    expect(folderButtons().map((b) => b.text())).toEqual([
      expect.stringContaining('3'),
      expect.stringContaining('7')
    ]);
    expect(folderButtons()[0].attributes('aria-pressed')).toBe('true');
    expect(folderButtons()[0].classes()).toContain('bg-primary');
  });

  it('switches selected folders and filters tracks', async () => {
    mountTab();
    await folderButtons()[1].trigger('click');
    expect(folderButtons()[1].attributes('aria-pressed')).toBe('true');
    expect(state.filterFolder).toHaveBeenLastCalledWith(
      'recent',
      state.library.tracks,
      expect.any(Object)
    );
    expect(wrapper!.findComponent(TracksStub).props('tracks')).toEqual([track('b')]);
  });

  it('renders smart playlists and their counts', () => {
    mountTab();
    expect(state.countPlaylist).toHaveBeenCalledWith(
      state.smart.smartPlaylists[0],
      state.library.tracks,
      expect.any(Object)
    );
    expect(playlistButtons()).toHaveLength(2);
    expect(wrapper!.text()).toContain('Smart sp1');
    expect(wrapper!.text()).toContain('4');
    expect(wrapper!.text()).toContain('5');
  });

  it('shows the empty hint without smart playlists', () => {
    state.smart.smartPlaylists = [];
    mountTab();
    expect(wrapper!.text()).toContain('library.smartPlaylists.empty');
    expect(playlistButtons()).toHaveLength(0);
  });

  it('selects smart playlists and resolves their tracks', async () => {
    mountTab();
    await playlistButtons()[0].trigger('click');
    expect(state.resolvePlaylist).toHaveBeenCalledWith(
      state.smart.smartPlaylists[0],
      state.library.tracks,
      expect.any(Object)
    );
    expect(wrapper!.findComponent(TracksStub).props('tracks')).toEqual([track('sp1')]);
    expect(playlistButtons()[0].attributes('aria-pressed')).toBe('true');
  });
});

describe('track playback', () => {
  it('plays a single track', () => {
    mountTab();
    const item = track('x');
    wrapper!.findComponent(TracksStub).vm.$emit('play', item);
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.setTrack).toHaveBeenCalledWith(item);
    expect(state.player.play).toHaveBeenCalled();
  });

  it('plays all current tracks', () => {
    state.filterFolder.mockReturnValue([track('a'), track('b')]);
    mountTab();
    wrapper!.findComponent(TracksStub).vm.$emit('play-all');
    expect(state.player.setTrack).toHaveBeenCalledWith(track('a'));
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([track('b')]);
    expect(state.player.play).toHaveBeenCalled();
  });

  it('does nothing when the current list is empty', () => {
    state.filterFolder.mockReturnValue([]);
    mountTab();
    wrapper!.findComponent(TracksStub).vm.$emit('play-all');
    expect(state.player.clearQueue).not.toHaveBeenCalled();
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });

  it('shuffles the current tracks before playing', () => {
    mountTab();
    wrapper!.findComponent(TracksStub).vm.$emit('shuffle-all');
    expect(state.shuffled).toHaveBeenCalledWith([track('a')]);
    expect(state.player.setTrack).toHaveBeenCalledWith(track('a'));
  });

  it('forwards view mode and edit events', async () => {
    mountTab();
    const tracks = wrapper!.findComponent(TracksStub);
    tracks.vm.$emit('update:viewMode', 'grid');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(TracksStub).props('viewMode')).toBe('grid');
    const item = track('x');
    wrapper!.findComponent(TracksStub).vm.$emit('edit', item);
    expect(wrapper!.emitted('edit')?.[0]?.[0]).toMatchObject({ id: 'x' });
  });
});

describe('create and edit dialogs', () => {
  it('opens a create dialog with no playlist', async () => {
    mountTab();
    await wrapper!.get('[data-testid="smart-playlist-new"]').trigger('click');
    const dialog = wrapper!.findComponent(DialogStub);
    expect(dialog.props('playlist')).toBeNull();
  });

  it('creates a playlist and selects it', async () => {
    mountTab();
    await wrapper!.get('[data-testid="smart-playlist-new"]').trigger('click');
    wrapper!.findComponent(DialogStub).vm.$emit('save', {
      name: 'New',
      match: 'all',
      rules: [],
      sort: 'title',
      sortDir: 'asc',
      limit: 0
    });
    await wrapper!.vm.$nextTick();

    expect(state.smart.create).toHaveBeenCalledWith({
      name: 'New',
      match: 'all',
      rules: [],
      sort: 'title',
      sortDir: 'asc',
      limit: 0
    });
    expect(wrapper!.find('[data-testid="smart-dialog"]').exists()).toBe(false);
  });

  it('opens edit with the playlist and updates it', async () => {
    mountTab();
    const edit = wrapper!.findAll('button[aria-label="library.smartPlaylists.editTitle"]')[0];
    await edit.trigger('click');
    expect(wrapper!.findComponent(DialogStub).props('playlist')).toMatchObject({ id: 'sp1' });

    wrapper!.findComponent(DialogStub).vm.$emit('save', {
      name: 'Edited',
      match: 'any',
      rules: [],
      sort: 'name',
      sortDir: 'desc',
      limit: 10
    });
    await wrapper!.vm.$nextTick();
    expect(state.smart.update).toHaveBeenCalledWith(
      'sp1',
      expect.objectContaining({ name: 'Edited' })
    );
    expect(playlistButtons()[0].attributes('aria-pressed')).toBe('true');
    expect(wrapper!.find('[data-testid="smart-dialog"]').exists()).toBe(false);
  });

  it('closes the dialog on cancel', async () => {
    mountTab();
    await wrapper!.get('[data-testid="smart-playlist-new"]').trigger('click');
    wrapper!.findComponent(DialogStub).vm.$emit('cancel');
    await wrapper!.vm.$nextTick();
    expect(wrapper!.find('[data-testid="smart-dialog"]').exists()).toBe(false);
  });
});

describe('deleting smart playlists', () => {
  it('asks for confirmation and deletes the playlist', async () => {
    mountTab();
    const remove = wrapper!.findAll('button[aria-label="common.delete"]')[0];
    await remove.trigger('click');
    await wrapper!.vm.$nextTick();

    expect(state.prompt.showConfirm).toHaveBeenCalledWith(
      'library.smartPlaylists.deleteConfirm:{"name":"Smart sp1"}'
    );
    expect(state.smart.remove).toHaveBeenCalledWith('sp1');
  });

  it('does nothing when confirmation is declined', async () => {
    state.prompt.showConfirm.mockResolvedValue(false);
    mountTab();
    await wrapper!.findAll('button[aria-label="common.delete"]')[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(state.smart.remove).not.toHaveBeenCalled();
  });

  it('resets the selection when deleting the active playlist', async () => {
    mountTab();
    await playlistButtons()[0].trigger('click');
    expect(playlistButtons()[0].attributes('aria-pressed')).toBe('true');

    await wrapper!.findAll('button[aria-label="common.delete"]')[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(folderButtons()[0].attributes('aria-pressed')).toBe('true');
  });

  it('keeps the current selection when deleting another playlist', async () => {
    mountTab();
    await playlistButtons()[1].trigger('click');
    await wrapper!.findAll('button[aria-label="common.delete"]')[0].trigger('click');
    await wrapper!.vm.$nextTick();
    expect(playlistButtons()[1].attributes('aria-pressed')).toBe('true');
    expect(folderButtons()[0].attributes('aria-pressed')).toBe('false');
  });
});
