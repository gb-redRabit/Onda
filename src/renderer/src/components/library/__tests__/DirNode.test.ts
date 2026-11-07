import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import DirNode from '../DirNode.vue';

const state = vi.hoisted(() => ({
  library: null as any,
  player: null as any,
  showFolderMenu: vi.fn(),
  requestThumb: vi.fn(),
  getThumb: vi.fn((path: string) => `thumb:${path}`),
  getChildDirs: vi.fn(),
  getAllTracks: vi.fn(),
  buildChildMeta: vi.fn(),
  directTracks: vi.fn(),
  trackMatches: vi.fn(),
  invoke: vi.fn(),
  childDirs: [] as string[],
  direct: [] as any[],
  meta: {} as Record<string, any>,
  folderTracks: [] as any[]
}));

vi.mock('@renderer/stores/library', () => ({ useLibraryStore: () => state.library }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useLibraryContextMenu', () => ({
  useLibraryContextMenu: () => ({ showFolderMenu: state.showFolderMenu })
}));
vi.mock('@renderer/composables/useThumbnails', () => ({
  useThumbnails: () => ({ request: state.requestThumb, getThumb: state.getThumb })
}));
vi.mock('@renderer/utils/formatters', () => ({
  formatDuration: (seconds: number) => `D${seconds}`
}));
vi.mock('@renderer/utils/libraryIndex', () => ({
  getChildDirsIndexed: state.getChildDirs,
  getAllTracksIndexed: state.getAllTracks
}));
vi.mock('@renderer/utils/clone', () => ({ clonePlain: (value: unknown) => value }));
vi.mock('@renderer/utils/librarySearch', () => ({
  trackMatchesQuery: state.trackMatches
}));
vi.mock('@renderer/utils/dirNode', () => ({
  buildChildMeta: state.buildChildMeta,
  directTracksInDir: state.directTracks,
  EMPTY_CHILD_META: { audio: [], audioCount: 0, duration: 0, subtree: 0, directAll: [] }
}));

const FolderTileStub = {
  props: ['tracks'],
  template: '<div data-testid="folder-tile" />'
};
const MixedStub = {
  props: ['folders', 'files', 'meta', 'getThumb'],
  emits: ['toggle', 'play', 'openImage', 'edit'],
  template: '<div data-testid="mixed" />'
};
const ChildFilesStub = {
  props: ['meta', 'childName', 'getThumb'],
  emits: ['openImage', 'edit'],
  template: '<div data-testid="child-files" />'
};
const DirectFilesStub = {
  props: ['audio', 'images', 'audioLimit', 'imageLimit', 'getThumb'],
  emits: ['openImage', 'edit', 'moreAudio', 'moreImages'],
  template: '<div data-testid="direct-files" />'
};

let wrapper: VueWrapper | null = null;

function track(id: string, type: 'audio' | 'video' | 'image', path = `C:/root/${id}`) {
  return {
    id,
    name: `${id}.${type === 'image' ? 'png' : type === 'video' ? 'mp4' : 'mp3'}`,
    path,
    type,
    size: 100,
    extension: type === 'image' ? 'png' : type === 'video' ? 'mp4' : 'mp3',
    mimeType: 'audio/mpeg',
    addedAt: 1000,
    playCount: 0
  } as any;
}

function childMeta(name: string, overrides: Record<string, unknown> = {}) {
  return {
    audio: [track(`a-${name}`, 'audio')],
    audioCount: 3,
    duration: 65,
    subtree: 12,
    directAll: [track(`d-${name}`, 'audio')],
    ...overrides
  };
}

function mountNode(props: Record<string, unknown> = {}) {
  wrapper = mount(DirNode, {
    props: {
      dir: 'C:/root',
      depth: 1,
      expandedPaths: new Set<string>(),
      query: '',
      ...props
    } as never,
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        LibraryFolderTile: FolderTileStub,
        DirMixedPreview: MixedStub,
        DirChildFiles: ChildFilesStub,
        DirDirectFiles: DirectFilesStub
      }
    }
  });
  return wrapper;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
  await wrapper!.vm.$nextTick();
}

beforeEach(() => {
  state.library = reactive({
    tracks: [],
    folders: ['C:/root']
  });
  state.player = {
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn(),
    setTrack: vi.fn(),
    play: vi.fn()
  };
  state.showFolderMenu.mockReset();
  state.requestThumb.mockReset();
  state.getThumb.mockClear();
  state.getChildDirs.mockReset();
  state.getChildDirs.mockReturnValue(['Alpha', 'Beta']);
  state.getAllTracks.mockReset();
  state.getAllTracks.mockReturnValue([]);
  state.buildChildMeta.mockReset();
  state.meta = { Alpha: childMeta('Alpha'), Beta: childMeta('Beta') };
  state.buildChildMeta.mockImplementation(() => state.meta);
  state.direct = [];
  state.directTracks.mockReset();
  state.directTracks.mockImplementation(() => state.direct);
  state.trackMatches.mockReset();
  state.trackMatches.mockReturnValue(true);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  state.folderTracks = [];
  state.childDirs = ['Alpha', 'Beta'];
  (window as { api?: unknown }).api = { invoke: state.invoke };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
});

function mainButtons() {
  return wrapper!.findAll('button').filter((b) => !b.attributes('title'));
}

describe('folder rows', () => {
  it('renders child folders with counts, duration and depth padding', async () => {
    mountNode();
    await flush();

    expect(mainButtons().map((b) => b.text())).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('Beta')
    ]);
    expect(wrapper!.text()).toContain('3');
    expect(wrapper!.text()).toContain('D65');

    const row = wrapper!.findAll('.group\\/row')[0];
    expect(row.attributes('style')).toContain('padding-left: 32px');
    expect(wrapper!.findAllComponents(FolderTileStub)).toHaveLength(2);
  });

  it('rotates the chevron for expanded folders', async () => {
    mountNode({ expandedPaths: new Set(['C:/root/Alpha']) });
    await flush();

    const chevrons = wrapper!.findAll('svg');
    expect(chevrons[0].classes()).not.toContain('-rotate-90');
  });

  it('toggles a folder and forwards the canonical path', async () => {
    mountNode();
    await flush();
    await mainButtons()[0].trigger('click');
    expect(wrapper!.emitted('toggle')?.[0]).toEqual(['C:/root/Alpha']);
  });

  it('opens the context menu with the subtree count', async () => {
    mountNode();
    await flush();
    await mainButtons()[0].trigger('contextmenu');
    const call = state.showFolderMenu.mock.calls[0];
    expect(call[0]).toBeInstanceOf(MouseEvent);
    expect(call[1]).toBe('C:/root/Alpha');
    expect(call[2]).toBe(12);
  });

  it('plays only non-image tracks under the folder that match the query', async () => {
    state.library.tracks = [
      track('a1', 'audio', 'C:/root/Alpha/one.mp3'),
      track('a2', 'audio', 'C:/root/Alpha/two.mp3'),
      track('i1', 'image', 'C:/root/Alpha/three.png'),
      track('outside', 'audio', 'C:/root/Beta/out.mp3')
    ];
    state.trackMatches.mockImplementation((t: any) => t.id !== 'a2');
    mountNode();
    await flush();

    const playButton = wrapper!.get('button[title="library.folderPlay"]');
    await playButton.trigger('click');

    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(state.player.setTrack).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
    expect(state.player.addToQueueMultiple).not.toHaveBeenCalled();
    expect(state.player.play).toHaveBeenCalled();
  });

  it('does nothing when the folder has no playable tracks', async () => {
    mountNode();
    await flush();
    await wrapper!.get('button[title="library.folderPlay"]').trigger('click');
    expect(state.player.clearQueue).not.toHaveBeenCalled();
  });

  it('opens the folder in the system explorer', async () => {
    mountNode();
    await flush();
    await wrapper!.get('button[title="common.showInFolder"]').trigger('click');
    expect(state.invoke).toHaveBeenCalledWith('shell:showItemInFolder', 'C:/root/Alpha');
  });

  it('serialises playable tracks for dragging', async () => {
    state.folderTracks = [
      track('a', 'audio', 'C:/root/Alpha/a.mp3'),
      track('img', 'image', 'C:/root/Alpha/i.png')
    ];
    state.getAllTracks.mockReturnValue(state.folderTracks);
    mountNode();
    await flush();

    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    await wrapper!.findAll('.group\\/row')[0].trigger('dragstart', { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      JSON.stringify({ paths: ['C:/root/Alpha/a.mp3'] })
    );
    expect(dataTransfer.effectAllowed).toBe('move');
  });
});

describe('mixed preview', () => {
  it('splits folders and files into preview slots', async () => {
    state.direct = [track('d1', 'audio'), track('d2', 'video'), track('d3', 'image')];
    mountNode();
    await flush();

    const mixed = wrapper!.findComponent(MixedStub);
    expect(mixed.props('folders')).toEqual(['Alpha', 'Beta']);
    expect((mixed.props('files') as unknown[]).map((f: any) => f.id)).toEqual(['d1', 'd2']);
  });

  it('limits the preview to three folders and skips extra slots', async () => {
    state.childDirs = ['A', 'B', 'C', 'D'];
    state.getChildDirs.mockReturnValue(state.childDirs);
    state.direct = [track('d1', 'audio'), track('d2', 'audio')];
    mountNode();
    await flush();

    const mixed = wrapper!.findComponent(MixedStub);
    expect(mixed.props('folders')).toEqual(['A', 'B', 'C']);
    expect((mixed.props('files') as unknown[]).map((f: any) => f.id)).toEqual(['d1']);
  });

  it('does not render a mixed preview for a single kind', async () => {
    state.getChildDirs.mockImplementation((dir: string) => (dir === 'C:/root' ? ['Alpha'] : []));
    state.direct = [];
    mountNode();
    await flush();
    expect(wrapper!.findAll('[data-testid="mixed"]')).toHaveLength(0);

    state.direct = [track('d1', 'audio')];
    await wrapper!.setProps({ dir: 'C:/other' });
    await flush();
    expect(wrapper!.findAll('[data-testid="mixed"]')).toHaveLength(0);
  });

  it('forwards preview events', async () => {
    state.library.tracks = [track('a1', 'audio', 'C:/root/Alpha/one.mp3')];
    state.direct = [track('d1', 'audio', 'C:/root/Alpha/d1.mp3')];
    mountNode();
    await flush();
    const mixed = wrapper!.findComponent(MixedStub);
    mixed.vm.$emit('toggle', 'Alpha');
    mixed.vm.$emit('play', 'C:/root/Alpha');
    mixed.vm.$emit('edit', track('x', 'audio'));
    await flush();

    expect(wrapper!.emitted('toggle')?.[0]).toEqual(['C:/root/Alpha']);
    expect(state.player.clearQueue).toHaveBeenCalled();
    expect(wrapper!.emitted('edit')?.[0]?.[0]).toMatchObject({ id: 'x' });
  });
});

describe('direct files and images', () => {
  it('passes split direct files and display limits', async () => {
    state.direct = [track('a', 'audio'), track('v', 'video'), track('i', 'image')];
    mountNode();
    await flush();

    const direct = wrapper!.findComponent(DirectFilesStub);
    expect((direct.props('audio') as unknown[]).map((t: any) => t.id)).toEqual(['a', 'v']);
    expect((direct.props('images') as unknown[]).map((t: any) => t.id)).toEqual(['i']);
    expect(direct.props('audioLimit')).toBe(50);
    expect(direct.props('imageLimit')).toBe(24);
  });

  it('increments limits and resets them when the query or file count changes', async () => {
    state.direct = [track('a', 'audio'), track('i', 'image')];
    mountNode();
    await flush();
    const direct = wrapper!.findComponent(DirectFilesStub);

    direct.vm.$emit('moreAudio');
    direct.vm.$emit('moreImages');
    await flush();
    expect(wrapper!.findComponent(DirectFilesStub).props('audioLimit')).toBe(100);
    expect(wrapper!.findComponent(DirectFilesStub).props('imageLimit')).toBe(48);

    await wrapper!.setProps({ query: 'x' });
    await flush();
    expect(wrapper!.findComponent(DirectFilesStub).props('audioLimit')).toBe(50);
    expect(wrapper!.findComponent(DirectFilesStub).props('imageLimit')).toBe(24);
  });

  it('opens the image viewer with cloned file data and the clicked index', async () => {
    const first = track('i1', 'image', 'C:/root/i1.png');
    const second = track('i2', 'image', 'C:/root/i2.png');
    state.direct = [first, second];
    mountNode();
    await flush();

    wrapper!.findComponent(DirectFilesStub).vm.$emit('openImage', second.path);
    await flush();

    expect(state.invoke).toHaveBeenCalledWith(
      'imageViewer:open',
      [
        expect.objectContaining({ path: first.path, isDirectory: false }),
        expect.objectContaining({ path: second.path })
      ],
      1
    );
  });

  it('falls back to index zero for unknown images', async () => {
    state.direct = [track('i1', 'image', 'C:/root/i1.png')];
    mountNode();
    await flush();

    wrapper!.findComponent(DirectFilesStub).vm.$emit('openImage', 'missing');
    expect(state.invoke).toHaveBeenLastCalledWith('imageViewer:open', expect.any(Array), 0);
  });

  it('forwards direct file edits', async () => {
    state.direct = [track('a', 'audio')];
    mountNode();
    await flush();
    wrapper!.findComponent(DirectFilesStub).vm.$emit('edit', state.direct[0]);
    expect(wrapper!.emitted('edit')?.[0]?.[0]).toBe(state.direct[0]);
  });

  it('requests thumbnails for direct and preview images', async () => {
    const image = track('i', 'image', 'C:/root/i.png');
    state.direct = [image, track('a', 'audio')];
    mountNode();
    await flush();

    expect(state.requestThumb).toHaveBeenCalledWith([image.path]);
  });
});

describe('expanded children', () => {
  it('renders a nested node, child files and forwards events', async () => {
    state.getChildDirs.mockImplementation((dir: string) => (dir === 'C:/root' ? ['Alpha'] : []));
    mountNode({ expandedPaths: new Set(['C:/root/Alpha']), depth: 2 });
    await flush();

    expect(wrapper!.findAllComponents(DirNode).length).toBe(1);
    expect(wrapper!.findAll('[data-testid="child-files"]')).toHaveLength(1);

    const childFiles = wrapper!.findComponent(ChildFilesStub);
    childFiles.vm.$emit('edit', track('x', 'audio'));
    childFiles.vm.$emit('openImage', 'Alpha', 'C:/root/Alpha/pic.png');
    await flush();
    expect(wrapper!.emitted('edit')?.length).toBeGreaterThan(0);
    expect(state.invoke).toHaveBeenCalledWith('imageViewer:open', expect.any(Array), 0);
  });

  it('opens images scoped to the child directory', async () => {
    const inside = track('in', 'image', 'C:/root/Alpha/in.png');
    const outside = track('out', 'image', 'C:/root/Beta/out.png');
    state.library.tracks = [inside, outside];
    state.getChildDirs.mockImplementation((dir: string) => (dir === 'C:/root' ? ['Alpha'] : []));
    mountNode({ expandedPaths: new Set(['C:/root/Alpha']) });
    await flush();

    wrapper!.findComponent(ChildFilesStub).vm.$emit('openImage', 'Alpha', inside.path);
    await flush();
    expect(state.invoke).toHaveBeenCalledWith(
      'imageViewer:open',
      [expect.objectContaining({ path: inside.path })],
      0
    );
  });
});
