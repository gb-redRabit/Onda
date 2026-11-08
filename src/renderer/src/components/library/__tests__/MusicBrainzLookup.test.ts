import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, reactive, ref } from 'vue';
import MusicBrainzLookup from '../MusicBrainzLookup.vue';

const state = vi.hoisted(() => ({
  ui: null as any,
  lookup: null as any,
  applyCallback: null as any,
  batch: null as any,
  batchDeps: null as any,
  buildRows: vi.fn(),
  t: vi.fn((key: string) => key)
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: state.t }) }));
vi.mock('@renderer/stores/ui', () => ({ useUIStore: () => state.ui }));
vi.mock('@renderer/utils/musicbrainz', () => ({ buildPreviewRows: state.buildRows }));
vi.mock('@renderer/composables/useMusicBrainzLookup', () => ({
  useMusicBrainzLookup: (options: any) => {
    state.applyCallback = options.onApply;
    return state.lookup;
  }
}));
vi.mock('@renderer/composables/useMusicBrainzBatch', () => ({
  useMusicBrainzBatch: (...deps: any[]) => {
    state.batchDeps = deps;
    return state.batch;
  }
}));

const ModalStub = defineComponent({
  emits: ['close', 'escape'],
  template: '<div data-testid="modal"><slot /></div>'
});
const FormStub = defineComponent({
  props: ['artist', 'title', 'album', 'year', 'loading'],
  emits: ['update:artist', 'update:title', 'update:album', 'update:year', 'search'],
  template: '<div data-testid="search-form" />'
});
const ReleaseStub = defineComponent({
  props: ['rel', 'selected', 'lookingUp', 'thumb'],
  emits: ['select'],
  template: '<div data-testid="release-card" />'
});
const TrackListStub = defineComponent({
  props: ['tracks'],
  template: '<div data-testid="track-list" />'
});
const PreviewStub = defineComponent({
  props: ['includeFields', 'rows', 'applyResult'],
  emits: ['update:includeFields'],
  template: '<div data-testid="preview-table" />'
});
const BatchStub = defineComponent({
  props: ['total', 'progress', 'results', 'running'],
  emits: ['start', 'cancel'],
  template: '<div data-testid="batch-panel" />'
});

let wrapper: VueWrapper | null = null;

function track(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    path: 'C:/music/a.mp3',
    name: 'a.mp3',
    type: 'audio',
    metadata: { artist: 'Artist', album: 'Album', title: 'Title', year: 1999 },
    ...overrides
  } as any;
}

function release(id: string) {
  return { id, title: `Release ${id}`, date: '1999-05-01', 'artist-credit': [{ name: 'Artist' }] };
}

function lookupState() {
  return {
    queryArtist: ref(''),
    queryTitle: ref(''),
    queryAlbum: ref(''),
    queryYear: ref(''),
    query: ref(''),
    releases: ref<any[]>([]),
    loading: ref(false),
    selectedId: ref<string | null>(null),
    lookingUp: ref<string | null>(null),
    error: ref(''),
    lookupResult: ref<any>(null),
    status: ref(''),
    coverThumbs: reactive({} as Record<string, string>),
    includeFields: ref<string[]>(['title']),
    applyResult: ref<any>(null),
    search: vi.fn(),
    selectRelease: vi.fn(),
    parseInitial: vi.fn(),
    applyTags: vi.fn()
  };
}

function mountView(props: Record<string, unknown> = {}) {
  wrapper = mount(MusicBrainzLookup, {
    props,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        ModalShell: ModalStub,
        MusicBrainzSearchForm: FormStub,
        MusicBrainzReleaseCard: ReleaseStub,
        MusicBrainzTrackList: TrackListStub,
        MusicBrainzPreviewTable: PreviewStub,
        MusicBrainzBatchPanel: BatchStub
      }
    }
  });
  return wrapper;
}

beforeEach(() => {
  state.ui = { notify: vi.fn() };
  state.lookup = lookupState();
  state.applyCallback = null;
  state.batch = {
    batchProgress: ref(0),
    batchResults: ref<any[]>([]),
    batchRunning: ref(false),
    startBatch: vi.fn(),
    cancelBatch: vi.fn()
  };
  state.batchDeps = null;
  state.buildRows.mockReset();
  state.buildRows.mockReturnValue([{ field: 'title', value: 'Title' }]);
  state.t.mockClear();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('mount', () => {
  it('does nothing without a query or track', () => {
    mountView();
    expect(state.lookup.parseInitial).not.toHaveBeenCalled();
    expect(state.lookup.search).not.toHaveBeenCalled();
  });

  it('parses an initial query', () => {
    mountView({ initialQuery: 'Artist - Title' });
    expect(state.lookup.parseInitial).toHaveBeenCalledWith('Artist - Title');
    expect(state.lookup.search).toHaveBeenCalled();
  });

  it('prefills fields from the track and searches', () => {
    state.lookup.query.value = 'Artist Album Title';
    mountView({ track: track() });
    expect(state.lookup.queryArtist.value).toBe('Artist');
    expect(state.lookup.queryAlbum.value).toBe('Album');
    expect(state.lookup.queryTitle.value).toBe('Title');
    expect(state.lookup.queryYear.value).toBe('1999');
    expect(state.lookup.search).toHaveBeenCalled();
    expect(state.lookup.parseInitial).not.toHaveBeenCalled();
  });

  it('does not search prefilled fields without a query', () => {
    state.lookup.query.value = '';
    mountView({ track: track() });
    expect(state.lookup.search).not.toHaveBeenCalled();
  });

  it('falls back to the initial query when track metadata is empty', () => {
    mountView({
      track: track({ metadata: {} }),
      initialQuery: 'fallback'
    });
    expect(state.lookup.queryArtist.value).toBe('');
    expect(state.lookup.parseInitial).toHaveBeenCalledWith('fallback');
    expect(state.lookup.search).toHaveBeenCalled();
  });

  it('parses and prefills when the initial query changes', async () => {
    mountView({ track: track() });
    state.lookup.parseInitial.mockClear();
    state.lookup.search.mockClear();
    state.lookup.queryArtist.value = '';
    state.lookup.queryTitle.value = '';

    await wrapper!.setProps({ initialQuery: 'new query' });
    await wrapper!.vm.$nextTick();
    expect(state.lookup.parseInitial).toHaveBeenCalledWith('new query');
    expect(state.lookup.queryArtist.value).toBe('Artist');
    expect(state.lookup.queryTitle.value).toBe('Title');
    expect(state.lookup.search).toHaveBeenCalled();

    state.lookup.parseInitial.mockClear();
    await wrapper!.setProps({ initialQuery: '' });
    expect(state.lookup.parseInitial).not.toHaveBeenCalled();
  });

  it('passes query fields through the form', async () => {
    mountView();
    const form = wrapper!.findComponent(FormStub);
    form.vm.$emit('update:artist', 'A');
    form.vm.$emit('update:title', 'T');
    form.vm.$emit('update:album', 'B');
    form.vm.$emit('update:year', '2000');
    form.vm.$emit('search');
    await wrapper!.vm.$nextTick();

    expect(state.lookup.queryArtist.value).toBe('A');
    expect(state.lookup.queryTitle.value).toBe('T');
    expect(state.lookup.queryAlbum.value).toBe('B');
    expect(state.lookup.queryYear.value).toBe('2000');
    expect(state.lookup.search).toHaveBeenCalled();
  });
});

describe('search results', () => {
  it('shows status, loading, error and empty states', async () => {
    state.lookup.status.value = 'Looking up';
    mountView();
    expect(wrapper!.text()).toContain('Looking up');

    state.lookup.loading.value = true;
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('musicbrainz.searching');

    state.lookup.loading.value = false;
    state.lookup.error.value = 'Network error';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('Network error');

    state.lookup.error.value = '';
    await wrapper!.vm.$nextTick();
    expect(wrapper!.text()).toContain('musicbrainz.emptyHint');
  });

  it('renders release cards with selection and thumbs', async () => {
    const releaseA = release('r1');
    const releaseB = release('r2');
    state.lookup.releases.value = [releaseA, releaseB];
    state.lookup.selectedId.value = 'r1';
    state.lookup.lookingUp.value = 'r2';
    state.lookup.coverThumbs.r1 = 'thumb.jpg';
    mountView();

    const cards = wrapper!.findAllComponents(ReleaseStub);
    expect(cards).toHaveLength(2);
    expect(cards[0].props()).toMatchObject({
      rel: expect.objectContaining({ id: 'r1' }),
      selected: true,
      lookingUp: false,
      thumb: 'thumb.jpg'
    });
    expect(cards[1].props()).toMatchObject({ selected: false, lookingUp: true });

    cards[0].vm.$emit('select');
    expect(state.lookup.selectRelease).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
  });

  it('renders the selected release details', () => {
    const releaseA = release('r1');
    state.lookup.releases.value = [releaseA];
    state.lookup.selectedId.value = 'r1';
    state.lookup.lookupResult.value = {
      title: 'Selected Album',
      date: '1999-05-01',
      'artist-credit': [{ name: 'Some Artist' }],
      media: [{ tracks: [{ id: 'track1' }] }]
    };
    mountView();

    expect(wrapper!.text()).toContain('musicbrainz.selected');
    expect(wrapper!.text()).toContain('Selected Album');
    expect(wrapper!.text()).toContain('(1999)');
    expect(wrapper!.text()).toContain('Some Artist');
    expect(wrapper!.findComponent(TrackListStub).props('tracks')).toEqual([{ id: 'track1' }]);
  });

  it('omits the date and falls back for a missing artist credit', () => {
    state.lookup.releases.value = [release('r1')];
    state.lookup.selectedId.value = 'r1';
    state.lookup.lookupResult.value = { title: 'No extras' };
    mountView();
    expect(wrapper!.text()).toContain('No extras');
    expect(wrapper!.text()).not.toContain('(');
    expect(wrapper!.text()).toContain('— ?');
    expect(wrapper!.findComponent(TrackListStub).props('tracks')).toEqual([]);
  });

  it('does not render details for non-selected releases', () => {
    state.lookup.releases.value = [release('r1'), release('r2')];
    state.lookup.selectedId.value = 'missing';
    state.lookup.lookupResult.value = { title: 'Selected' };
    mountView();
    expect(wrapper!.text()).not.toContain('Selected');
    expect(wrapper!.findComponent(TrackListStub).exists()).toBe(false);
  });
});

describe('apply and preview', () => {
  it('builds preview rows from the lookup result and track', () => {
    const item = track();
    state.lookup.lookupResult.value = { title: 'Result' };
    state.lookup.releases.value = [release('r1')];
    state.lookup.selectedId.value = 'r1';
    mountView({ track: item });

    expect(state.buildRows).toHaveBeenCalledWith(
      state.lookup.lookupResult.value,
      expect.objectContaining({ id: 't1' }),
      ['title']
    );
    const preview = wrapper!.findComponent(PreviewStub);
    expect(preview.props()).toMatchObject({
      rows: [{ field: 'title', value: 'Title' }],
      applyResult: null
    });
  });

  it('forwards include-field changes', async () => {
    state.lookup.lookupResult.value = { title: 'Result' };
    state.lookup.releases.value = [release('r1')];
    state.lookup.selectedId.value = 'r1';
    mountView({ track: track() });

    wrapper!.findComponent(PreviewStub).vm.$emit('update:includeFields', ['title', 'artist']);
    await wrapper!.vm.$nextTick();
    expect(state.lookup.includeFields.value).toEqual(['title', 'artist']);
  });

  it('applies tags from the non-batch button', async () => {
    state.lookup.lookupResult.value = { title: 'Result' };
    state.lookup.releases.value = [release('r1')];
    state.lookup.selectedId.value = 'r1';
    mountView({ track: track() });

    const apply = wrapper!.findAll('button').find((b) => b.text().includes('musicbrainz.apply'))!;
    await apply.trigger('click');
    expect(state.lookup.applyTags).toHaveBeenCalled();
  });

  it('forwards applied data through the lookup callback', () => {
    mountView();
    state.applyCallback({ title: 'X' });
    expect(wrapper!.emitted('apply')?.[0]).toEqual([{ title: 'X' }]);
  });
});

describe('batch mode', () => {
  function setupSelectedBatch() {
    state.lookup.lookupResult.value = { title: 'Result' };
    state.lookup.releases.value = [release('r1')];
    state.lookup.selectedId.value = 'r1';
    const tracks = [track(), track({ id: 't2', path: 'C:/music/b.mp3' })];
    mountView({ track: track(), batchTracks: tracks });
    return tracks;
  }

  it('wires the batch composable to lookup state', () => {
    const tracks = setupSelectedBatch();
    expect(state.batchDeps).toHaveLength(3);
    expect(state.batchDeps[0]()).toBe(state.lookup.lookupResult.value);
    expect(state.batchDeps[1]()).toEqual(['title']);
    expect(state.batchDeps[2]()).toEqual(tracks);
  });

  it('renders the batch panel instead of the apply button', () => {
    setupSelectedBatch();
    const panel = wrapper!.findComponent(BatchStub);
    expect(panel.props()).toMatchObject({
      total: 2,
      progress: 0,
      results: [],
      running: false
    });
    expect(wrapper!.text()).not.toContain('musicbrainz.apply');
  });

  it('forwards batch start and cancel', () => {
    setupSelectedBatch();
    const panel = wrapper!.findComponent(BatchStub);
    panel.vm.$emit('start');
    panel.vm.$emit('cancel');
    expect(state.batch.startBatch).toHaveBeenCalled();
    expect(state.batch.cancelBatch).toHaveBeenCalled();
  });
});

describe('overlay closing', () => {
  it('requires a second click and warns when there is data', async () => {
    vi.useFakeTimers();
    mountView();
    state.lookup.queryArtist.value = 'Artist';
    await wrapper!.vm.$nextTick();

    const modal = wrapper!.findComponent(ModalStub);
    modal.vm.$emit('close');
    expect(state.ui.notify).toHaveBeenCalledWith('info', 'common.clickAgainToClose');
    expect(wrapper!.emitted('close')).toBeUndefined();

    modal.vm.$emit('close');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('also requires two clicks when empty and resets the counter', async () => {
    vi.useFakeTimers();
    mountView();
    const modal = wrapper!.findComponent(ModalStub);

    modal.vm.$emit('close');
    expect(state.ui.notify).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);

    modal.vm.$emit('close');
    expect(state.ui.notify).toHaveBeenCalledTimes(2);
    expect(wrapper!.emitted('close')).toBeUndefined();

    modal.vm.$emit('close');
    expect(wrapper!.emitted('close')).toHaveLength(1);
  });

  it('closes from the close button and the Escape event', async () => {
    mountView();
    await wrapper!.get('button[aria-label="common.close"]').trigger('click');
    expect(wrapper!.emitted('close')).toHaveLength(1);

    wrapper!.findComponent(ModalStub).vm.$emit('escape');
    expect(wrapper!.emitted('close')).toHaveLength(2);
  });

  it('clears the reset timer on unmount', () => {
    vi.useFakeTimers();
    mountView();
    wrapper!.findComponent(ModalStub).vm.$emit('close');
    wrapper!.unmount();
    wrapper = null;
    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
  });
});
