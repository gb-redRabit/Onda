import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import DownloadsView from '../DownloadsView.vue';

const state = vi.hoisted(() => ({
  yt: null as any,
  player: null as any,
  router: { push: vi.fn() },
  searchRef: null as any,
  writeString: vi.fn(),
  groupDownloads: vi.fn(),
  visibleDownloads: vi.fn(),
  buildFilters: vi.fn(),
  rowItems: [] as any[],
  total: 0,
  measureElement: vi.fn(),
  grant: vi.fn(),
  invoke: vi.fn()
}));

vi.mock('vue-router', () => ({ useRouter: () => state.router }));
vi.mock('@renderer/stores/online', () => ({ useOnlineStore: () => state.yt }));
vi.mock('@renderer/stores/player', () => ({ usePlayerStore: () => state.player }));
vi.mock('@renderer/composables/useViewSearch', () => ({
  useViewSearch: (target: any) => {
    state.searchRef = target;
  }
}));
vi.mock('@renderer/utils/localStore', () => ({ writeString: state.writeString }));
vi.mock('@renderer/utils/downloadsView', () => ({
  groupDownloads: state.groupDownloads,
  visibleDownloads: state.visibleDownloads,
  buildDownloadFilters: state.buildFilters
}));
vi.mock('@renderer/composables/useVirtualList', () => ({
  useVirtualList: () =>
    ref({
      getVirtualItems: () => state.rowItems,
      getTotalSize: () => state.total,
      measureElement: state.measureElement
    })
}));

const ToolbarStub = defineComponent({
  props: { activeCount: Number, pausedCount: Number, hasFinished: Boolean },
  template: '<div data-testid="toolbar" />'
});
const FiltersStub = defineComponent({
  props: ['filter', 'channelFilter', 'filters', 'channels'],
  emits: ['update:filter', 'update:channelFilter'],
  template: '<div data-testid="filters" />'
});
const RowStub = defineComponent({
  props: ['task'],
  emits: ['play', 'edit-meta', 'open-library', 'retry-cover'],
  template: '<div data-testid="download-row" />'
});
const EmptyStub = defineComponent({
  props: ['title', 'icon'],
  template: '<div data-testid="downloads-empty" />'
});
const MetaStub = defineComponent({
  props: ['open', 'artist', 'album', 'year'],
  emits: ['close', 'save', 'update:artist', 'update:album', 'update:year'],
  template: '<div data-testid="meta-dialog" />'
});

let wrapper: VueWrapper | null = null;

function task(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Task ${id}`,
    kind: 'audio',
    channelId: 'ch1',
    channelTitle: 'Channel',
    outputPath: `C:/out/${id}.mp3`,
    startedAt: 100,
    ...overrides
  } as any;
}

function mountView() {
  wrapper = mount(DownloadsView, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        DownloadToolbar: ToolbarStub,
        DownloadFiltersBar: FiltersStub,
        DownloadRow: RowStub,
        EmptyState: EmptyStub,
        DownloadMetaDialog: MetaStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.yt = reactive({
    downloads: [task('a'), task('b', { channelId: 'ch2', channelTitle: '' })],
    updateMetadata: vi.fn().mockResolvedValue(undefined),
    retryCover: vi.fn().mockResolvedValue(undefined)
  });
  state.player = reactive({
    setTrack: vi.fn(),
    play: vi.fn(),
    clearQueue: vi.fn(),
    addToQueueMultiple: vi.fn()
  });
  state.router.push.mockReset();
  state.router.push.mockResolvedValue(undefined);
  state.writeString.mockReset();
  state.rowItems = [{ index: 0, start: 0 }];
  state.total = 80;
  state.measureElement.mockReset();
  state.groupDownloads.mockReset();
  state.groupDownloads.mockReturnValue({
    active: [task('a')],
    completed: [task('b')],
    failed: [],
    pausedCount: 2
  });
  state.visibleDownloads.mockReset();
  state.visibleDownloads.mockReturnValue([task('a'), task('b')]);
  state.buildFilters.mockReset();
  state.buildFilters.mockReturnValue({ all: 2, active: 1, completed: 1, failed: 0 });
  state.grant.mockReset();
  state.grant.mockResolvedValue(undefined);
  state.invoke.mockReset();
  state.invoke.mockResolvedValue(undefined);
  (window as { api?: unknown }).api = {
    grantMediaAccess: state.grant,
    invoke: state.invoke
  };
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('toolbar and filters', () => {
  it('computes channels with dedupe and fallbacks', () => {
    state.yt.downloads = [
      task('a', { channelId: 'ch1', channelTitle: 'One' }),
      task('b', { channelId: 'ch1', channelTitle: 'Ignored' }),
      task('c', { channelId: 'ch2', channelTitle: '' }),
      task('d', { channelId: '', channelTitle: 'No id' })
    ];
    mountView();
    const filters = wrapper!.findComponent(FiltersStub);
    expect(filters.props('channels')).toEqual([
      ['ch1', 'One'],
      ['ch2', 'ch2']
    ]);
    expect(filters.props('filters')).toEqual(state.buildFilters.mock.results[0].value);
  });

  it('passes toolbar counts', async () => {
    mountView();
    expect(wrapper!.findComponent(ToolbarStub).props()).toEqual({
      activeCount: 1,
      pausedCount: 2,
      hasFinished: true
    });

    state.groupDownloads.mockReturnValue({
      active: [],
      completed: [],
      failed: [],
      pausedCount: 0
    });
    state.visibleDownloads.mockReturnValue([]);
    state.yt.downloads = [];
    await wrapper!.vm.$nextTick();
    expect(wrapper!.findComponent(ToolbarStub).props('hasFinished')).toBe(false);
  });

  it('forwards filter and channel changes to the visible selector', async () => {
    mountView();
    const filters = wrapper!.findComponent(FiltersStub);
    state.visibleDownloads.mockClear();

    filters.vm.$emit('update:filter', 'completed');
    filters.vm.$emit('update:channelFilter', 'ch2');
    await wrapper!.vm.$nextTick();

    expect(state.visibleDownloads).toHaveBeenLastCalledWith(
      state.yt.downloads,
      state.groupDownloads.mock.results.at(-1)!.value,
      'completed',
      'ch2',
      ''
    );
  });

  it('passes the search query from the shared composable', async () => {
    mountView();
    state.visibleDownloads.mockClear();
    state.searchRef.value = 'needle';
    await wrapper!.vm.$nextTick();
    expect(state.visibleDownloads.mock.lastCall?.[4]).toBe('needle');
  });
});

describe('list rendering', () => {
  it('renders virtual rows for visible downloads', async () => {
    mountView();
    await wrapper!.vm.$nextTick();
    const rows = wrapper!.findAll('[data-index]');
    expect(rows).toHaveLength(1);
    expect(rows[0].attributes('data-index')).toBe('0');
    expect(rows[0].attributes('style')).toContain('translateY(0px)');
    expect(wrapper!.findComponent(RowStub).props('task')).toMatchObject({ id: 'a' });
  });

  it('shows the empty state without visible downloads', () => {
    state.visibleDownloads.mockReturnValue([]);
    state.rowItems = [];
    mountView();
    expect(wrapper!.find('[data-testid="downloads-empty"]').exists()).toBe(true);
    expect(wrapper!.findAll('[data-index]')).toHaveLength(0);
  });

  it('measures rows rendered by the virtualizer', async () => {
    mountView();
    await wrapper!.vm.$nextTick();
    expect(state.measureElement).toHaveBeenCalledWith(expect.any(HTMLElement));
  });
});

describe('row actions', () => {
  it('plays a completed download', async () => {
    const item = task('a', { outputPath: 'C:/out/Clip.MP4', kind: 'video' });
    state.visibleDownloads.mockReturnValue([item]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('play');

    expect(state.grant).toHaveBeenCalledWith('C:/out/Clip.MP4');
    expect(state.player.setTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'dl-a',
        name: 'Task a',
        path: 'C:/out/Clip.MP4',
        extension: 'mp4',
        type: 'video',
        addedAt: 100
      })
    );
    expect(state.player.play).toHaveBeenCalled();
    expect(state.router.push).toHaveBeenCalledWith('/player');
  });

  it('opens an audio file in the audio view even when the task kind says video', async () => {
    const item = task('a', { outputPath: 'C:/out/Song.MP3', kind: 'video' });
    state.visibleDownloads.mockReturnValue([item]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('play');
    await flushPromises();

    expect(state.player.setTrack).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'C:/out/Song.MP3', extension: 'mp3', type: 'audio' })
    );
    expect(state.router.push).toHaveBeenCalledWith('/audio');
  });

  it('opens a video file in the video view even when the task kind says audio', async () => {
    const item = task('a', { outputPath: 'C:/out/Clip.MKV', kind: 'audio' });
    state.visibleDownloads.mockReturnValue([item]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('play');
    await flushPromises();

    expect(state.player.setTrack).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'C:/out/Clip.MKV', extension: 'mkv', type: 'video' })
    );
    expect(state.router.push).toHaveBeenCalledWith('/player');
  });

  it('falls back to the task kind for an unknown extension', async () => {
    const item = task('a', { outputPath: 'C:/out/file.bin', kind: 'video' });
    state.visibleDownloads.mockReturnValue([item]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('play');
    await flushPromises();

    expect(state.player.setTrack).toHaveBeenCalledWith(
      expect.objectContaining({ extension: 'bin', type: 'video' })
    );
    expect(state.router.push).toHaveBeenCalledWith('/player');
  });

  it('opens an image in the image viewer instead of the player', async () => {
    const item = task('a', { outputPath: 'C:/out/Photo.JPG', kind: 'video' });
    state.visibleDownloads.mockReturnValue([item]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('play');
    await flushPromises();

    expect(state.grant).toHaveBeenCalledWith('C:/out/Photo.JPG');
    expect(state.invoke).toHaveBeenCalledWith(
      'imageViewer:open',
      [
        expect.objectContaining({
          name: 'Photo.JPG',
          path: 'C:/out/Photo.JPG',
          extension: 'jpg',
          isDirectory: false,
          size: 0,
          modifiedAt: 100,
          createdAt: 100
        })
      ],
      0
    );
    expect(state.grant.mock.invocationCallOrder[0]).toBeLessThan(
      state.invoke.mock.invocationCallOrder[0]
    );
    expect(state.player.setTrack).not.toHaveBeenCalled();
    expect(state.player.play).not.toHaveBeenCalled();
    expect(state.router.push).not.toHaveBeenCalled();
  });

  it('ignores downloads without an output path', () => {
    const item = task('a', { outputPath: '' });
    state.visibleDownloads.mockReturnValue([item]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('play');
    expect(state.grant).not.toHaveBeenCalled();
    expect(state.player.setTrack).not.toHaveBeenCalled();
  });

  it('opens the library tab from a row', async () => {
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('open-library');

    expect(state.writeString).toHaveBeenCalledWith('onda.libraryTab', 'tracks');
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'library',
      query: { tab: 'tracks' }
    });
  });

  it('opens the video tab for video downloads', async () => {
    state.visibleDownloads.mockReturnValue([task('a', { kind: 'video' })]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('open-library');
    expect(state.writeString).toHaveBeenCalledWith('onda.libraryTab', 'video');
    expect(state.router.push).toHaveBeenCalledWith({
      name: 'library',
      query: { tab: 'video' }
    });
  });

  it('retries covers through the store', () => {
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('retry-cover');
    expect(state.yt.retryCover).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });
});

describe('metadata editor', () => {
  function openEditor(item: any) {
    state.visibleDownloads.mockReturnValue([item]);
    mountView();
    wrapper!.findComponent(RowStub).vm.$emit('edit-meta');
    return wrapper!.findComponent(MetaStub);
  }

  it('prefills existing overrides', async () => {
    const item = task('a', {
      metaOverride: { artist: 'A', album: 'B', year: '1999' }
    });
    const dialog = await openEditor(item);
    expect(dialog.props()).toMatchObject({ open: true, artist: 'A', album: 'B', year: '1999' });
  });

  it('uses empty fields without overrides', async () => {
    const dialog = await openEditor(task('a'));
    expect(dialog.props()).toMatchObject({ open: true, artist: '', album: '', year: '' });
  });

  it('saves trimmed values and closes', async () => {
    const item = task('a');
    const dialog = openEditor(item);
    dialog.vm.$emit('update:artist', ' Artist ');
    dialog.vm.$emit('update:album', ' Album ');
    dialog.vm.$emit('update:year', ' 2001 ');
    await wrapper!.vm.$nextTick();

    dialog.vm.$emit('save');
    await wrapper!.vm.$nextTick();
    expect(state.yt.updateMetadata).toHaveBeenCalledWith(item.outputPath, {
      artist: 'Artist',
      album: 'Album',
      year: '2001'
    });
    await vi.waitFor(() => expect(wrapper!.findComponent(MetaStub).props('open')).toBe(false));
  });

  it('skips empty metadata and closes', async () => {
    const dialog = openEditor(task('a'));
    dialog.vm.$emit('save');
    await wrapper!.vm.$nextTick();
    expect(state.yt.updateMetadata).not.toHaveBeenCalled();
    expect(dialog.props('open')).toBe(false);
  });

  it('sends partial metadata', async () => {
    const item = task('a');
    const dialog = openEditor(item);
    dialog.vm.$emit('update:album', 'Only album');
    await wrapper!.vm.$nextTick();
    dialog.vm.$emit('save');
    await wrapper!.vm.$nextTick();
    expect(state.yt.updateMetadata).toHaveBeenCalledWith(item.outputPath, { album: 'Only album' });
  });

  it('does nothing without an output path', async () => {
    const dialog = await openEditor(task('a', { outputPath: '' }));
    dialog.vm.$emit('update:artist', 'A');
    await wrapper!.vm.$nextTick();
    dialog.vm.$emit('save');
    await flushPromises();
    await wrapper!.vm.$nextTick();
    expect(state.yt.updateMetadata).not.toHaveBeenCalled();
    expect(dialog.props('open')).toBe(true);
  });

  it('closes without saving', async () => {
    const dialog = await openEditor(task('a'));
    dialog.vm.$emit('close');
    return wrapper!.vm.$nextTick().then(() => {
      expect(dialog.props('open')).toBe(false);
      expect(state.yt.updateMetadata).not.toHaveBeenCalled();
    });
  });
});
