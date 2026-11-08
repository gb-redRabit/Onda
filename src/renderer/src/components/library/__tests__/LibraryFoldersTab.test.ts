import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import LibraryFoldersTab from '../LibraryFoldersTab.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  showFolderMenu: vi.fn(),
  getAllTracks: vi.fn(),
  getTracksFor: {} as Record<string, any[]>,
  readStringArray: vi.fn(),
  writeJson: vi.fn(),
  invoke: vi.fn(),
  locale: null as any,
  t: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  )
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: state.locale, t: state.t }) }));
vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/utils/path', () => ({
  canonicalPath: (p: string) => p.replace(/\\/g, '/').toLowerCase(),
  basename: (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p,
  isUnderPath: (p: string, dir: string) => p.startsWith(dir)
}));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showFolderMenu: state.showFolderMenu })
}));
vi.mock('@renderer/utils/formatters', () => ({
  formatDuration: (seconds: number) => `D${seconds}`
}));
vi.mock('@renderer/utils/plural', () => ({
  pluralCategory: (_locale: string, count: number) =>
    count === 1 ? 'one' : count >= 2 && count <= 4 ? 'few' : 'many'
}));
vi.mock('@renderer/utils/libraryIndex', () => ({
  getAllTracksIndexed: (...args: any[]) => state.getAllTracks(...args)
}));
vi.mock('@renderer/utils/shuffle', () => ({
  shuffled: (items: unknown[]) => [...items].reverse()
}));
vi.mock('@renderer/utils/localStore', () => ({
  readStringArray: state.readStringArray,
  writeJson: state.writeJson
}));

const DirNodeStub = defineComponent({
  props: ['dir', 'depth', 'expandedPaths', 'query'],
  emits: ['toggle', 'playFolder', 'edit'],
  template: '<div data-testid="dir-node" />'
});
const FolderTileStub = defineComponent({
  props: ['tracks'],
  template: '<div data-testid="folder-tile" />'
});

let wrapper: VueWrapper | null = null;

function track(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    path: `C:/Music/${id}.mp3`,
    name: `${id}.mp3`,
    type: 'audio',
    duration: 10,
    ...overrides
  } as any;
}

function libraryState(overrides: Record<string, unknown> = {}) {
  return {
    folders: ['C:/Music', 'C:\\Video', 'C:/Images', 'C:/Unknown'],
    tracks: [] as any[],
    getFolderType: vi.fn((path: string) => {
      if (path.startsWith('C:/Music')) return 'audio';
      if (path.includes('Video')) return 'video';
      if (path.includes('Images')) return 'image';
      return 'other';
    }),
    ...overrides
  };
}

function mountTab(props: Record<string, unknown> = {}) {
  wrapper = mount(LibraryFoldersTab, {
    props: { query: '', ...props } as never,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { DirNode: DirNodeStub, LibraryFolderTile: FolderTileStub }
    }
  });
  return wrapper;
}

function expandButtons() {
  return wrapper!.findAll('button[aria-label="library.expandFolder"]');
}

beforeEach(() => {
  state.library = reactive(libraryState());
  state.player = {
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn()
  };
  state.showFolderMenu.mockReset();
  state.readStringArray.mockReset();
  state.readStringArray.mockReturnValue([]);
  state.writeJson.mockReset();
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.locale = ref('pl');
  state.t.mockClear();
  state.getAllTracks.mockReset();
  state.getTracksFor = {
    'C:/Music': [
      track('a', { type: 'audio' }),
      track('b', { type: 'image', path: 'C:/Music/b.png' }),
      track('c', { type: 'audio' })
    ],
    'C:\\Video': [track('v', { type: 'video', path: 'C:\\Video/v.mp4', name: 'v.mp4' })]
  };
  state.getAllTracks.mockImplementation((path: string) => state.getTracksFor[path] ?? []);
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('empty and no-match states', () => {
  it('shows the empty folder hint when no folders exist', () => {
    state.library.folders = [];
    mountTab();
    expect(wrapper!.text()).toContain('library.noFolders');
    expect(wrapper!.text()).toContain('library.addFolderHint');
    expect(wrapper!.findAll('[data-testid="folder-tile"]')).toHaveLength(0);
  });

  it('shows the no-results state only for a non-empty query', async () => {
    state.getAllTracks.mockReturnValue([]);
    mountTab({ query: 'x' });
    expect(wrapper!.text()).toContain('library.noResultsFor');

    await wrapper!.setProps({ query: '   ' });
    expect(wrapper!.text()).not.toContain('library.noResultsFor');

    state.library.folders = [];
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('library.noFolders');
  });
});

describe('folder metadata', () => {
  it('renders names, types, counts, durations and mosaics', () => {
    mountTab();
    expect(wrapper!.findAll('[data-testid="folder-tile"]')).toHaveLength(4);
    expect(wrapper!.text()).toContain('Music');
    expect(wrapper!.text()).toContain('Video');
    expect(wrapper!.text()).toContain('🎵');
    expect(wrapper!.text()).toContain('🎬');
    expect(wrapper!.text()).toContain('D30');

    const tiles = wrapper!.findAllComponents(FolderTileStub);
    expect(tiles[0].props('tracks')).toHaveLength(3);
  });

  it('omits durations when the folder has no playtime', () => {
    state.getAllTracks.mockReturnValue([track('x', { duration: 0 })]);
    mountTab();
    expect(wrapper!.text()).not.toContain('D0');
  });

  it('renders icons for image and unknown folder types', () => {
    state.getAllTracks.mockImplementation((path: string) =>
      path.includes('Images') || path.includes('Unknown') ? [track('x')] : []
    );
    mountTab();
    expect(wrapper!.text()).toContain('🖼️');
    expect(wrapper!.text()).toContain('📁');
  });

  it('filters folders by track name or path', async () => {
    mountTab({ query: 'v.mp4' });
    expect(wrapper!.findAll('[data-testid="folder-tile"]')).toHaveLength(1);
    expect(wrapper!.text()).toContain('Video');

    await wrapper!.setProps({ query: 'C:/MUSIC/B.PNG' });
    expect(wrapper!.findAll('[data-testid="folder-tile"]')).toHaveLength(1);
    expect(wrapper!.text()).toContain('Music');
  });

  it('uses the plural form for one, few and many', () => {
    state.getAllTracks.mockReturnValue([track('a')]);
    mountTab();
    expect(state.t).toHaveBeenCalledWith('library.fileCountOne', { count: 1 });

    wrapper!.unmount();
    state.getAllTracks.mockReturnValue([track('a'), track('b'), track('c')]);
    mountTab();
    expect(state.t).toHaveBeenCalledWith('library.fileCountFew', { count: 3 });

    wrapper!.unmount();
    state.getAllTracks.mockReturnValue(Array.from({ length: 5 }, (_, index) => track(`t${index}`)));
    mountTab();
    expect(state.t).toHaveBeenCalledWith('library.fileCountMany', { count: 5 });
  });
});

describe('expansion persistence', () => {
  it('restores expanded folders from storage', () => {
    state.readStringArray.mockReturnValue(['C:/Music']);
    mountTab();
    expect(wrapper!.find('[data-testid="dir-node"]').exists()).toBe(true);
    expect(expandButtons()[0].attributes('aria-expanded')).toBe('true');
    expect(wrapper!.findComponent(DirNodeStub).props()).toMatchObject({
      dir: 'C:/Music',
      depth: 0,
      query: ''
    });
  });

  it('toggles folders, persists the state and matches canonical paths', async () => {
    mountTab();
    expect(wrapper!.find('[data-testid="dir-node"]').exists()).toBe(false);

    await expandButtons()[0].trigger('click');
    expect(wrapper!.find('[data-testid="dir-node"]').exists()).toBe(true);
    expect(state.writeJson).toHaveBeenLastCalledWith('onda.libraryExpanded', ['C:/Music']);

    await expandButtons()[0].trigger('click');
    expect(wrapper!.find('[data-testid="dir-node"]').exists()).toBe(false);
    expect(state.writeJson).toHaveBeenLastCalledWith('onda.libraryExpanded', []);

    state.readStringArray.mockReturnValue(['C:\\Video']);
    wrapper!.unmount();
    mountTab();
    await expandButtons()[1].trigger('click');
    expect(state.writeJson).toHaveBeenLastCalledWith('onda.libraryExpanded', []);
  });

  it('forwards DirNode events', async () => {
    state.readStringArray.mockReturnValue(['C:/Music']);
    mountTab();
    const node = wrapper!.findComponent(DirNodeStub);
    node.vm.$emit('toggle', 'C:/Music/Sub');
    await wrapper!.vm.$nextTick();
    expect(state.writeJson).toHaveBeenLastCalledWith('onda.libraryExpanded', [
      'C:/Music',
      'C:/Music/Sub'
    ]);

    const item = track('z');
    node.vm.$emit('play-folder', 'C:/Music/Sub');
    node.vm.$emit('edit', item);
    expect(wrapper!.emitted('playFolder')?.[0]).toEqual(['C:/Music/Sub']);
    expect(wrapper!.emitted('edit')?.[0]).toEqual([item]);
  });
});

describe('folder actions', () => {
  it('emits playFolder and navigates to the system explorer', async () => {
    mountTab();
    await wrapper!.get('button[title="library.folderPlay"]').trigger('click');
    expect(wrapper!.emitted('playFolder')?.[0]).toEqual(['C:/Music']);

    await wrapper!.get('button[title="library.folderShowInExplorer"]').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'C:/Music');
  });

  it('shuffles non-image tracks in reverse order', async () => {
    mountTab();
    await wrapper!.get('button[title="library.folderShuffle"]').trigger('click');
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.addToQueueMultiple).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'a' })
    ]);
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
    expect(state.player.play).toHaveBeenCalled();
  });

  it('does nothing when a folder has no playable tracks', async () => {
    state.getAllTracks.mockReturnValue([]);
    mountTab();
    await wrapper!.get('button[title="library.folderShuffle"]').trigger('click');
    expect(state.player.clearQueue).not.toHaveBeenCalled();
  });

  it('serialises non-image tracks on drag', async () => {
    mountTab();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    await wrapper!.findAll('div[draggable="true"]')[0].trigger('dragstart', { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ paths: ['C:/Music/a.mp3', 'C:/Music/c.mp3'] })
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('opens the folder context menu with the folder tracks', async () => {
    mountTab();
    await wrapper!.findAll('div[draggable="true"]')[0].trigger('contextmenu');
    const call = state.showFolderMenu.mock.calls[0];
    expect(call[0]).toBeInstanceOf(MouseEvent);
    expect(call[1]).toBe('C:/Music');
    expect(call[2]).toEqual(state.library.tracks.filter((t: any) => t.path.startsWith('C:/Music')));
  });
});
